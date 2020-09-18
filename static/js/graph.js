class Graph {
    constructor(id, type, tooltip) {
        this.id = id;
        this.type = type;
        this.svg = d3.select(id);
        this.tooltip = tooltip;
        this.simulation = createForceSimulation();
    }
}

var width = 1100,
    height = 400

$('.svg-container').attr("width", width);
$('.svg-container').attr("height", height);

$('svg').width('100%')
$('svg').height('100%')

var link_lengths = {'http': 100, 'next_link': 50, 'has_agent': 50, 'relationship': 100};
var node_charges = {'c2': -200, 'operation': -100, 'agent': -200, 'link': -150, 'fact': -50, 'tactic': -200, 'technique_name': -200}

var graphSvg = new Graph("#debrief-graph-svg", "graph", null),
    tacticSvg = new Graph("#debrief-tactic-svg", "tactic", d3.select('#op-tooltip')),
    techniqueSvg = new Graph("#debrief-technique-svg", "technique", d3.select('#op-tooltip')),
    factSvg = new Graph("#debrief-fact-svg", "fact", d3.select('#fact-tooltip')),
    elasticSvg = new Graph("#debrief-elastic-svg", "elastic", d3.select('#fact-tooltip'))

var graphs = [graphSvg, factSvg, tacticSvg, techniqueSvg, elasticSvg];

var imgs = {
    "c2": "debrief/img/cloud.svg",
    "operation": "debrief/img/operation.svg",
    "link": "debrief/img/link.svg",
    "fact": "debrief/img/star.svg",
    "darwin": "debrief/img/darwin.svg",
    "windows": "debrief/img/windows.svg",
    "linux": "debrief/img/linux.svg",
    "tactic": "debrief/img/tactic.svg",
    "technique_name": "debrief/img/technique.svg"}

for (var key in imgs) {
    getImage(key, imgs[key])
}

function getImage(i, value) {
    $.get(value, function(data) {
        data.documentElement.id = i + "-img"
        let svg = $(data.documentElement).clone();
        data.documentElement.classList.add("svg-icon")
        $('#images').append(data.documentElement);
        addToLegend(i, svg[0]);
    })
}

function addToLegend(id, svg) {
    svg.id += "-legend";
    svg.setAttribute("width", 25);
    svg.setAttribute("height", 25);
    let liHTML = $("<li class='legend'></li>");
    liHTML.append(svg);
    id = id.replace("_", " ");
    liHTML.append($("<label style='padding: 10px'>" + id + "</label>"));

    if (id == "operation") {
        $("#fact-legend-list").append(liHTML.clone());
        $("#op-legend-list").append(liHTML);
    }
    else if (id == "fact") {
        $("#fact-legend-list").append(liHTML);
    }
    else {
        $("#op-legend-list").append(liHTML);
    }
}

var colors = d3.scaleOrdinal(d3.schemeCategory10);

function createForceSimulation() {
    return d3.forceSimulation()
            .force("link", d3.forceLink().id(function(d) { return d.id; }))
            .force('charge', d3.forceManyBody()
                .strength(function(d) { return node_charges.hasOwnProperty(d.type) ? node_charges[d.type] : -200 })
                .theta(0.8)
                .distanceMax(100))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(16));
}

function updateReportGraph(operations){
    $('.debrief-svg').innerHTML = "";
    d3.selectAll(".debrief-svg > *").remove();

    graphs.forEach(function(graphObj) {
        buildGraph(graphObj, operations)
        graphObj.simulation.alpha(1).restart();
        graphObj.svg.call(d3.zoom().scaleExtent([0.5, 5]).on("zoom", function() {
            d3.select(graphObj.id + " .container")
                .attr("transform", "translate(" + d3.event.transform.x + "," + d3.event.transform.y + ")scale(" + d3.event.transform.k + ")");
        }));
    });
}

function buildGraph(graphObj, operations) {
    let url = "/plugin/debrief/graph?type=" + graphObj.type + "&operations=" + operations.join();
    d3.json(url, function (error, graph) {
        if (error) throw error;
        writeGraph(graph, graphObj);
    });
}

function writeGraph(graph, graphObj) {

    graphObj.svg.append('defs').append('marker')
        .attrs({'id':'arrowhead'+graphObj.type,
            'viewBox':'-0 -5 10 10',
            'refX':30,
            'refY':0,
            'orient':'auto',
            'markerWidth':8,
            'markerHeight':8,
            'xoverflow':'visible'})
        .append('svg:path')
        .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
        .attr('fill', '#999')
        .style('stroke','none');

    var container = graphObj.svg.append("g")
                        .attr("class", "container")
                        .attr("width", "100%")
                        .attr("height", "100%")

    var link = container.append("g")
                .style("stroke", "#aaa")
                .selectAll("line")
                .data(graph.links)
                .enter().append("line")
                .attr("class", function(d) { return d.type;})
                .attr('marker-end','url(#arrowhead' + graphObj.type + ')');

    container.selectAll('g.nodes').remove();
    var nodes = container.append("g")
        .attr("class", "nodes")
        .selectAll("g")
        .data(graph.nodes)
        .enter().append("g")
            .attr("class", function(d) { return "node " + d.type; })
            .call(d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended));

    nodes.append("circle")
        .attr("r", 16)
        .style("fill", "#efefef")
        .style("stroke", "#424242")
        .style("stroke-width", "1px")

    nodes.append("text")
        .attr("class", "label")
        .attr("x", "18")
        .attr("y", "8")
        .style("font-size", "12px").style("fill", "#333")
        .text(function(d) {
            if (d.type != 'link') {
                return d.name;
            }
        });

    nodes.append("g")
        .html(function(d) {
            if ($("#" + d.img + "-img").length > 0) {
                let c = $("#" + d.img + "-img")[0].cloneNode(true)
                $(c).removeAttr("id")
                $(c).attr("width", 32)
                $(c).attr("height", 16)
                $(c).attr("x", "-16")
                $(c).attr("y", "-8")
                return c.outerHTML
            }
        })

    let simulation = graphObj.simulation;

    simulation
        .nodes(graph.nodes)
        .on("tick", ticked)
        .force('link')
        .links(graph.links)
        .distance(function(d) {return link_lengths[d.type];});

    function ticked() {
        link
            .attr("x1", function(d) { return d.source.x; })
            .attr("y1", function(d) { return d.source.y; })
            .attr("x2", function(d) { return d.target.x; })
            .attr("y2", function(d) { return d.target.y; });

        nodes
            .attr('transform', function(d) {return 'translate(' + d.x + ',' + d.y + ')';})
            .on("mouseover", function(d) {
                if (graphObj.tooltip) {
                    graphObj.tooltip.transition()
                        .duration(200)
                        .style("opacity", .9);
                    graphObj.tooltip.html(generateTooltipHTML(d))
                        .style("left", d.x+50 + "px")
                        .style("top", d.y + "px");
                }
            })
            .on("mouseout", function(d) {
                if (graphObj.tooltip) {
                    graphObj.tooltip.transition()
                        .duration(500)
                        .style("opacity", 0);
                }
            });
    }

    function dragstarted(d) {
      if (!d3.event.active) simulation.alphaTarget(0.3).restart()
      d.fx = d.x
      d.fy = d.y
    }

    function dragged(d) {
      d.fx = d3.event.x
      d.fy = d3.event.y
    }

    function dragended(d) {
      d.fx = d3.event.x
      d.fy = d3.event.y
      if (!d3.event.active) simulation.alphaTarget(0);
    }

  function generateTooltipHTML(d) {
    let ret = "";
    if (d["type"] == "operation") {
        ret += "name: " + d["name"] + "<br/>";
        ret += "op_id: " + d["id"] + "<br/>";
    }
    else if (d["type"] == "tactic" || d["type"] == "technique_name") {
        let p = d["attrs"][d["type"]]
        ret += d["type"] + ": " + p + "<br/>";
        for (let attr in d["attrs"]) {
            if (attr != d["type"]) {
                ret += attr + ": " + d["attrs"][attr] + "<br/>";
            }
        }
    }
    else {
        for (let attr in d["attrs"]) {
            if (d["attrs"][attr]) {
                ret += attr + ": " + d["attrs"][attr] + "<br/>";
            }
        }
    }
    return ret
  }
}
