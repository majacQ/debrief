var nodesOrderedByTime;
var visualizeInterval;

$( document ).ready(function() {
    $('#debrief-operation-list').change(function (e){
        clearReport();
        let operations = $(e.target).val();
        if (operations) {
            updateReportGraph(operations);
            $('.debrief-display-opt').prop("checked", true);
            $("#show-tactic-icons").prop("checked", false);
            $("#fact-limit-msg").hide();
            $("#fact-limit-msg p").html();
            restRequest('POST', {'operations': operations}, displayReport, '/plugin/debrief/report');
        }
    });

    $(".debrief-sidebar-header").click(function(){
        $(this).next(".debrief-sidebar").slideToggle("slow");
    });

    function clearReport(){
        $("#report-operations tbody tr").remove();
        $("#report-steps tbody tr").remove();
        $("#report-agents tbody tr").remove();
        $("#report-tactics-techniques tbody tr").remove();
    }

    function displayReport(data){
        let operations = data['operations'];
        operations.forEach(function (op, index) {
            updateOperationTable(op);
            updateStepTable(op);
        })
        updateAgentTable(data['agents']);
        updateTacticTechniqueTable(data['ttps']);
        nodesOrderedByTime = getNodesOrderedByTime();
    }

    function updateOperationTable(op){
        $("#report-operations tbody").append("<tr>" +
            "<td>"+op.name+"</td>" +
            "<td style='text-transform: capitalize;'>"+op.state+"</td>" +
            "<td>"+op.planner.name+"</td>" +
            "<td>"+op.objective.name+"</td>" +
            "<td>"+op.start+"</td>" +
            "</tr>");
    }

    function updateStepTable(op){
        op.chain.forEach(function (step, index) {
            $("#report-steps tbody").append("<tr>" +
                "<td>"+statusName(step.status) +"</td>" +  //
                "<td>"+step.finish+"</td>" +  //
                "<td>"+step.ability.name+"</td>" +
                "<td>"+step.paw+"</td>" +
                "<td>"+op.name+"</td>" +  //
                "<td><button data-encoded-cmd='"+step.command +"' onclick='findResults(this,"+step.id+")'>Show" +
                " Command</button></td>" +
                "</tr>");
        })
    }

    function updateTacticTechniqueTable(ttps) {
        function generateList(objList, innerList) {
            let ret = innerList ? "<ul>" : "<ul style='padding: 0px'>";
            objList.forEach(function(obj) {
                ret += "<li>" + obj + "</li>"
            })
            ret += "</ul>"
            return ret;
        }
        function generateTechniqueList(techniques) {
            let arr = [];
            for (let name in techniques) {
                arr.push(techniques[name] + ": " + name);
            }
            return generateList(arr, false);
        }
        function generateStepList(steps) {
            let ret = "<ul style='padding: 0px'>"
            for (let opName in steps) {
                ret += "<li style='color: grey'>" + opName + "</li>";
                ret += generateList(steps[opName], true);
            }
            ret += "</ul>"
            return ret;
        }
        for (let key in ttps) {
            let tactic = ttps[key];
            $("#report-tactics-techniques tbody").append("<tr>" +
                "<td style='text-transform: capitalize;'>" + tactic.name + "</td>" +
                "<td>" + generateTechniqueList(tactic.techniques) + "</td>" +
                "<td>" + generateStepList(tactic.steps) + "</td>" +
                "</tr");
        }
    }

    function updateAgentTable(agents) {
        agents.forEach(function(agent) {
            $("#report-agents tbody").append("<tr>" +
                "<td>" + agent.paw + "</td>" +
                "<td>" + agent.host + "</td>" +
                "<td>" + agent.platform + "</td>" +
                "<td>" + agent.username + "</td>" +
                "<td>" + agent.privilege + "</td>" +
                "<td>" + agent.exe_name + "</td>" +
                "</tr>"
            );
        })
    }

	initSectionOrderingList();
	displayReportSections();
});

function switchGraphView(btn) {
    $(".op-svg").hide();
    $(".graph-switch").attr("disabled", false);
    $("#graph-switch-" + $(btn).val()).attr("disabled", true);
    $("#debrief-" + $(btn).val() + "-svg").show();
}

function downloadPDF() {
    stream("Generating PDF report... ");
	var reportSections = JSON.parse(localStorage.getItem('report-section-order')).map(x => x.split(/-(.+)/)[1]);
    restRequest(
    	'POST', {
    		'operations': $('#debrief-operation-list').val(),
    		'graphs': getGraphData(),
    		'report-sections': reportSections,
    		'header-logo': $('#debrief-header-logo-list').val()
		},
 		downloadReport("pdf"),
 		'/plugin/debrief/pdf'
	);
}

function downloadJSON() {
    stream("Generating JSON report... ");
    restRequest("POST", {"operations": $("#debrief-operation-list").val()}, downloadReport("json"), "/plugin/debrief/json");
}

function downloadReport(downloadType) {
    return function(data) {
        if (typeof data == "string") {
            stream("Select at least one operation to generate a report");
        }
        else {
            let dataStr;
            let filename = data["filename"] + "." + downloadType;
            stream("Downloading " + downloadType.toUpperCase() + " report: " + filename);
            switch(downloadType) {
                case "pdf":
                    dataStr = URL.createObjectURL(new Blob([data["pdf_bytes"]], { type: "application/pdf" }));
                    break;
                case "json":
                    dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data["json_bytes"], null, 2));
                    break;
                default:
                    stream("Unknown report type returned");
                    return;
            }
            let downloadAnchorNode = document.createElement("a");
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", filename);
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        }
    }
}

function findResults(elem, lnk){
    function loadResults(data){
        if (data) {
            let res = atob(data.output);
            $.each(data.link.facts, function (k, v) {
                let regex = new RegExp(String.raw`${v.value}`, "g");
                res = res.replace(regex, "<span class='highlight'>" + v.value + "</span>");
            });
            $('#debrief-step-modal-view').html(res);
        }
    }
    document.getElementById('debrief-step-modal').style.display='block';
    $('#debrief-step-modal-cmd').html(atob($(elem).attr('data-encoded-cmd')));
    restRequest('POST', {'index':'result','link_id':lnk}, loadResults);
}

function resetDebriefStepModal() {
    let modal = $('#debrief-step-modal');
    modal.hide();
    modal.find('#debrief-step-modal-cmd').text('');
    modal.find('#debrief-step-modal-view').text('');
}

function getGraphData() {
    let encodedGraphs = {}

    $(".debrief-svg").each(function(idx, svg) {
        $("#copy").append($(svg).clone().prop("id", "copy-svg"))
        $("#copy-svg .container").attr("transform", "scale(5)")

//        resize svg viewBox to fit content
        var copy = $("#copy-svg")[0];
        if (copy.style.display == "none") {
            copy.style.display = "";
        }
        var bbox = copy.getBBox();
        var viewBox = [bbox.x - 10, bbox.y - 10, bbox.width + 20, bbox.height + 20].join(" ");
        copy.setAttribute("viewBox", viewBox);

//        re-enable any hidden nodes
        $("#copy-svg .link").show()
        $("#copy-svg polyline").show()
        $("#copy-svg .link .icons").children('.svg-icon').show();
        $("#copy-svg .link .icons").children('.hidden').remove();
        $("#copy-svg text").show();
        $("#copy-svg text").css("fill", "#333");

        let serializedSvg = new XMLSerializer().serializeToString($("#copy-svg")[0])
        let encodedData = window.btoa(serializedSvg);
        let graphKey = $(svg).attr("id").split("-")[1]
        encodedGraphs[graphKey] = encodedData
        $("#copy").html("")
    })

    return encodedGraphs
}

function toggleLabels(input) {
    if($(input).prop("checked")) {
        $("#debrief-graph .label").show();
    }
    else {
        $("#debrief-graph .label").hide();
    }
}

function toggleSteps(input) {
    if($(input).prop("checked")) {
        $("#debrief-graph .link").show()
        $("#debrief-graph-svg .next_link").show()
    }
    else {
        $("#debrief-graph .link").hide()
        $("#debrief-graph-svg .next_link").hide()
    }
}

function toggleTacticIcons(input) {
    let showing = $("#debrief-graph .link .icons").children(".svg-icon:not(hidden)");
    let hidden = $("#debrief-graph .link .icons").children(".hidden");
    showing.hide();
    hidden.show();
    showing.addClass("hidden");
    hidden.removeClass("hidden");
}

function toggleIcons(input) {
    if($(input).prop("checked")) {
        $("#debrief-graph .svg-icon:not(.hidden)").show();
    }
    else {
        $("#debrief-graph .svg-icon:not(.hidden)").hide();
    }
}

function visualizeTogglePlay() {
    let graphId = getVisibleOpGraphId()
    if ($("#graph-media-play").hasClass("paused")) {
        if (!nodesOrderedByTime[graphId].find(node => node.style.display == "none")) {
            visualizeBeginning();
        }
        $("#graph-media-play").removeClass("paused");
        $("#graph-media-play").html("||");
        visualizeInterval = setInterval(visualizeStepForward, 1000);
    }
    else {
        $("#graph-media-play").html("&#x25B6;");
        $("#graph-media-play").addClass("paused");
        clearInterval(visualizeInterval);
    }
}

function visualizeStepForward() {
    let graphId = getVisibleOpGraphId()
    let nextNode = nodesOrderedByTime[graphId].find(node => node.style.display == "none");
    if (nextNode) {
        $(nextNode).show();

        let showingNodesIds = nodesOrderedByTime[graphId].filter(node => node.style.display != "none").map(node => node.id);
        let relatedLines = $("#" + graphId + " polyline").filter(function(idx, line) {
            return showingNodesIds.includes("node-" + $(line).data("target")) && showingNodesIds.includes("node-" + $(line).data("source"))
        })
        relatedLines.show();
    }

    if (!$("#graph-media-play").hasClass("paused") && !nodesOrderedByTime[graphId].find(node => node.style.display == "none")) {
        $("#graph-media-play").addClass("paused");
        $("#graph-media-play").html("&#x25B6;");
        clearInterval(visualizeInterval);
    }
}

function visualizeStepBack() {
    let graphId = getVisibleOpGraphId()
    let prevNode = $(nodesOrderedByTime[graphId].slice().reverse().find(node => node.style.display != "none"));

    if (prevNode.attr("id") != "#node-0") {
        prevNode.hide();

        let showingNodesIds = nodesOrderedByTime[graphId].filter(node => node.style.display != "none").map(node => node.id);
        let relatedLines = $("#" + graphId + " polyline").filter(function(idx, line) {
            return !(showingNodesIds.includes("node-" + $(line).data("target")) && showingNodesIds.includes("node-" + $(line).data("source")))
        })
        relatedLines.hide();
    }

}

function visualizeBeginning() {
    let graphId = getVisibleOpGraphId()
    $("#" + graphId + " .node:not(.c2)").hide();
    $("#" + graphId + " polyline").hide();
}

function visualizeEnd() {
    let graphId = getVisibleOpGraphId()
    $("#" + graphId + " .node").show();
    $("#" + graphId + " polyline").show();
}

function getNodesOrderedByTime() {
    function compareTimestamp(a, b) {
        if (Date.parse(a.dataset.timestamp) < Date.parse(b.dataset.timestamp)) {
            return -1;
        }
        if (Date.parse(a.dataset.timestamp) > Date.parse(b.dataset.timestamp)) {
            return 1;
        }
        return 0;
    }
    function getSortedNodes(id) {
        return $("#" + id + " .node").toArray().sort(compareTimestamp);
    }
    let graphNodesByTime = {};
    graphNodesByTime["debrief-graph-svg"] = getSortedNodes("debrief-graph-svg");
    graphNodesByTime["debrief-tactic-svg"] = getSortedNodes("debrief-tactic-svg");
    graphNodesByTime["debrief-technique-svg"] = getSortedNodes("debrief-technique-svg");
    return graphNodesByTime;
}

function getVisibleOpGraphId() {
    return $(".op-svg").filter(function() { return $(this).css("display") != "none" }).attr("id");
}

function reportSelectAll() {
    if ($("#report-select-all").prop("checked")) {
        $(".debrief-report-opt").prop("checked", true);
    }
}

function uncheckSelectAll(checkbox) {
    if (!$(checkbox).prop("checked")) {
        $("#report-select-all").prop("checked", false);
    }
}

function uploadHeaderLogo() {
	let logoFiles = document.getElementById("logo-file").files;
	if (logoFiles.length > 0){
		let formData = new FormData();
		let logoFile = logoFiles[0];
		formData.append("header-logo", logoFile);
		fetch('/plugin/debrief/uploadlogo', {method: "POST", body: formData}).then( response => {
			if (response.status == 200) {
				stream("Logo file uploaded!");
				updateLogoSelection(logoFile);
				showLogoPreview();
			}
		}).catch( e=> {
			stream("Error uploading logo: " + e.message);
		});
	}
}

function triggerLogoUploadButton() {
	document.getElementById('logo-file').click();
}

function updateReportSectionOrderingList() {
	var reportSections = document.getElementsByClassName("debrief-report-opt");
	var oldOrderedList = JSON.parse(localStorage.getItem('report-section-order'));
	if (oldOrderedList == null) {
		oldOrderedList = [];
	}
	oldSelectedSet = new Set(oldOrderedList);
	currSelectedSet = new Set();

	for (var i = 0; i < reportSections.length; i++) {
		var reportSection = reportSections[i];
		if (reportSection.checked) {
			currSelectedSet.add(reportSection.id);
			if (!oldSelectedSet.has(reportSection.id)) {
				// New report section selected. Add to end of ordered list
				oldOrderedList.push(reportSection.id);
				oldSelectedSet.add(reportSection.id);
			}
		}
	}

	// Check if there are any sections to remove from ordered list.
	var newOrderedList = [];
	for (i = 0; i < oldOrderedList.length; i++) {
		var sectionId = oldOrderedList[i];
		if (currSelectedSet.has(sectionId)) {
			section = document.getElementById(sectionId);
			newOrderedList.push(sectionId);
		}
	}
	localStorage.setItem('report-section-order', JSON.stringify(newOrderedList));
	displayReportSectionOrderingList();
}

function toggleReportSection() {
	// Current selected section
	var selectedItemId = $('#selected-report-section-ordering-list').val();

	// Ordered list of report sections
	var orderedList = JSON.parse(localStorage.getItem('report-section-order'));

	// Check if current selected section is enabled or not
	var enabledMapping = JSON.parse(localStorage.getItem('report-section-selection-dict'));
	if (selectedItemId in enabledMapping) {
		if (enabledMapping[selectedItemId]) {
			// Previously enabled. Disable section.
			enabledMapping[selectedItemId] = false;
			let index = orderedList.indexOf(selectedItemId);
			if (index >= 0) {
				orderedList.splice(index, 1);
			}
		} else {
			// Previously disabled. Enable section.
			enabledMapping[selectedItemId] = true;
			orderedList.push(selectedItemId);
		}
		localStorage.setItem('report-section-order', JSON.stringify(orderedList));
		localStorage.setItem('report-section-selection-dict', JSON.stringify(enabledMapping));
	} else {
		stream("Could not recognize " + selectedItemId + " as a known report section");
	}
}

function displayReportSections() {
	// current selected item
	var selectedItemId = $('#selected-report-section-ordering-list').val();

	// ordered enabled sections
	var orderedList = JSON.parse(localStorage.getItem('report-section-order'));

	// display names
	var displayNames = JSON.parse(localStorage.getItem('report-section-names'));

	// get disabled sections
	var enabledMapping = JSON.parse(localStorage.getItem('report-section-selection-dict'));
	var disabledSections = [];
	for (const [ sectionId, enabled ] of Object.entries(enabledMapping)) {
		if (!enabled) {
			disabledSections.push(sectionId)
		}
	}

	// sort disabled sections alphabetically by display name
	disabledSections.sort(function(a, b) {
		if (displayNames[a] < displayNames[b]) {
			return -1;
		}
		if (displayNames[a] > displayNames[b]) {
			return 1;
		}
		return 0;
	});

	// Clear current display
	document.getElementById("selected-report-section-ordering-list").innerHTML = '';

	// Display enabled sections
	var enabledOptGroupHTML = '<optgroup label="ENABLED SECTIONS">';
	for (i = 0; i < orderedList.length; i++) {
		var sectionId = orderedList[i];
		//let rowHTML = '<option class="ordered-report-section" value="' + sectionId + '">' + displayNames[sectionId] + '</option>';
		//document.getElementById("selected-report-section-ordering-list").insertAdjacentHTML('beforeend', rowHTML);
		enabledOptGroupHTML += '<option class="ordered-report-section" value="' + sectionId + '">' + displayNames[sectionId] + '</option>';
	}
	enabledOptGroupHTML += '</optgroup>';
	document.getElementById("selected-report-section-ordering-list").insertAdjacentHTML('beforeend', enabledOptGroupHTML);

	var separatorHTML = '<hr style="margin: 5 0 5;">';
	document.getElementById("selected-report-section-ordering-list").insertAdjacentHTML('beforeend', separatorHTML);

	// Display disabled sections
	var disabledOptGroupHTML = '<optgroup label="DISABLED SECTIONS">';
	var numDisabled = disabledSections.length;
	for (i = 0; i < numDisabled; i++) {
		var sectionId = disabledSections[i];
		//let rowHTML = '<option class="disabled-report-section" value="' + sectionId + '">[DISABLED] ' + displayNames[sectionId] + '</option>';
		//document.getElementById("selected-report-section-ordering-list").insertAdjacentHTML('beforeend', rowHTML);
		disabledOptGroupHTML += '<option class="disabled-report-section" value="' + sectionId + '">' + displayNames[sectionId] + '</option>';
	}
	disabledOptGroupHTML += '</optgroup>';
	document.getElementById("selected-report-section-ordering-list").insertAdjacentHTML('beforeend', disabledOptGroupHTML);

	// Keep selected item highlighted
	if (selectedItemId != null) {
		$('#selected-report-section-ordering-list').val(selectedItemId);
	}
}

function initSectionOrderingList() {
	var reportSectionNames = {
		"reportsection-statistics": "Statistics",
		"reportsection-agents": "Agents",
		"reportsection-default-graph": "Operations Graph",
		"reportsection-tactic-graph": "Tactic Graph",
		"reportsection-technique-graph": "Technique Graph",
		"reportsection-fact-graph": "Fact Graph",
		"reportsection-tactic-technique-table": "Tactic and Technique Table",
		"reportsection-steps-table": "Steps Tables",
		"reportsection-facts-table": "Operation Facts Tables",
	};

	var reportSectionEnabledMapping = {};
	for (var key in reportSectionNames) {
		reportSectionEnabledMapping[key] = true;
	}

	// Contains list of element IDs for selected report sections.
	localStorage.setItem('report-section-order', JSON.stringify(Object.keys(reportSectionNames)));

	// Maps report section element IDs to whether or not they are enabled
	localStorage.setItem('report-section-selection-dict', JSON.stringify(reportSectionEnabledMapping));

	// Contains mapping of report section element IDs to their names
	localStorage.setItem('report-section-names', JSON.stringify(reportSectionNames));
}

function moveReportSection(direction) {
	var orderedList = JSON.parse(localStorage.getItem('report-section-order'));
	var selectedSectionId = $('#selected-report-section-ordering-list').val();
	var oldIndex = orderedList.indexOf(selectedSectionId);
	if (oldIndex >= 0) {
		if (direction.toLowerCase() === 'up') {
			if (oldIndex > 0) {
				orderedList.splice(oldIndex, 1);
				orderedList.splice(oldIndex - 1, 0, selectedSectionId);
			}
		} else if (direction.toLowerCase() === 'down') {
			if (oldIndex < orderedList.length - 1) {
				orderedList.splice(oldIndex, 1);
				orderedList.splice(oldIndex + 1, 0, selectedSectionId);
			}
		}
		// Update storage
		localStorage.setItem('report-section-order', JSON.stringify(orderedList));
	}
}

function updateLogoSelection(logoFile) {
	// Add the newly uploaded logo file to the displayed list of logos.
	filename = logoFile.name;
	let rowHTML = '<option class="header-logo-option" value="' + filename + '">' + filename + '</option>';
	let logoList = document.getElementById("debrief-header-logo-list");
	logoList.insertAdjacentHTML('beforeend', rowHTML);
	logoList.value = filename;
}

function showLogoPreview() {
	var selectedLogoName = $('#debrief-header-logo-list').val();
	let element = document.getElementById("debrief-report-logo-preview");
	if (element.hasChildNodes()) {
		element.removeChild(element.childNodes[0]);
	}
	if (selectedLogoName != null && selectedLogoName != 'no-logo') {
		let imgHTML = '<img style="width: 100%; height: auto; border-radius:0; border:none;" src="/logodebrief/header-logos/' + selectedLogoName  + '"/>';
		element.insertAdjacentHTML('beforeend', imgHTML);
	}
}