// ════════════════════════════════════════════════════════
// DRONELOG AI - FRONTEND LOGIC
// ════════════════════════════════════════════════════════

console.log("main.js loaded!");

// ──── STATE ────────────────────────────────────────────
let currentFlightId = null;
let selectedFlightIds = []; // Array for multiple selections
let uploadedFile = null;

// Get upload elements immediately
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");

console.log("Elements found:", { dropzone: !!dropzone, fileInput: !!fileInput, uploadBtn: !!uploadBtn });

// ──── TAB SWITCHING ────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
        const tab = e.target.dataset.tab;

        // Update buttons
        document.querySelectorAll(".tab-btn").forEach(b => {
            b.classList.remove("active", "border-b-2", "border-blue-600", "text-blue-600");
            b.classList.add("text-gray-600");
        });
        e.target.classList.add("active", "border-b-2", "border-blue-600", "text-blue-600");
        e.target.classList.remove("text-gray-600");

        // Update content
        document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
        document.getElementById(tab).classList.add("active");

        if (tab === "qa") {
            loadReports();
            loadFleetSummary();
        }
    });
});

// ──── UPLOAD SECTION ────────────────────────────────────

// Drag & drop
if (dropzone) {
    dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.style.backgroundColor = "#fffaf5";
    });

    dropzone.addEventListener("dragleave", () => {
        dropzone.style.backgroundColor = "#ffffff";
    });

    dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.style.backgroundColor = "#ffffff";
        handleFiles(e.dataTransfer.files);
    });

    dropzone.addEventListener("click", () => {
        if (fileInput) fileInput.click();
    });
    console.log("Dropzone listeners attached");
} else {
    console.error("Dropzone not found!");
}

if (fileInput) {
    fileInput.addEventListener("change", (e) => {
        handleFiles(e.target.files);
    });
    console.log("FileInput listener attached");
} else {
    console.error("FileInput not found!");
}

function handleFiles(files) {
    console.log("handleFiles called with", files.length, "files");
    if (files.length === 0) return;

    const file = files[0];
    console.log("File selected:", file.name);

    if (!file.name.endsWith(".bin")) {
        console.warn("File is not .bin:", file.name);
        showUploadError("Only .bin files allowed");
        return;
    }

    uploadedFile = file;
    if (uploadBtn) {
        uploadBtn.disabled = false;
        uploadBtn.style.backgroundColor = "#ff9f43";
        uploadBtn.style.color = "#000000";
        uploadBtn.textContent = `📤 Ready: ${file.name}`;
        console.log("Button enabled and updated");
    } else {
        console.error("uploadBtn not found!");
    }
}

if (uploadBtn) {
    uploadBtn.addEventListener("click", () => {
        console.log("Upload button clicked!");
        console.log("uploadedFile:", uploadedFile);
        if (!uploadedFile) {
            alert("Please select a file first");
            return;
        }
        alert("Upload started! Please wait...");
        uploadAndAnalyze();
    });
    console.log("Upload button listener attached");
} else {
    console.error("Upload button not found!");
}

async function uploadAndAnalyze() {
    if (!uploadedFile) return;

    uploadBtn.disabled = true;
    document.getElementById("uploadError").style.display = "none";
    document.getElementById("loadingIndicator").style.display = "block";

    const formData = new FormData();
    formData.append("file", uploadedFile);

    // Show progress
    const progressContainer = document.getElementById("progressContainer");
    const progressBar = document.getElementById("progressBar");
    const progressText = document.getElementById("progressText");
    const loadingStatus = document.getElementById("loadingStatus");

    progressContainer.style.display = "block";
    loadingStatus.textContent = "📤 Uploading file...";

    try {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                progressBar.style.width = percentComplete + "%";
                progressText.textContent = `Uploading: ${percentComplete.toFixed(0)}%`;
            }
        });

        xhr.addEventListener("load", () => {
            console.log("XHR load event, status:", xhr.status);
            console.log("Response text:", xhr.responseText);
            if (xhr.status === 200) {
                try {
                    const result = JSON.parse(xhr.responseText);
                    console.log("Parsed result:", result);
                    loadingStatus.textContent = "✅ Upload complete! Processing results...";
                    setTimeout(() => {
                        document.getElementById("loadingIndicator").style.display = "none";
                        displayAnalysisResult(result);
                        uploadedFile = null;
                        uploadBtn.disabled = true;
                        uploadBtn.textContent = "📤 Upload & Process";
                        progressContainer.style.display = "none";
                        progressBar.style.width = "0%";
                    }, 500);
                } catch (e) {
                    console.error("Failed to parse response:", e);
                    showUploadError("Failed to parse response: " + e.message);
                }
            } else {
                console.error("Upload failed with status:", xhr.status);
                document.getElementById("loadingIndicator").style.display = "none";
                try {
                    const error = JSON.parse(xhr.responseText);
                    showUploadError(error.error);
                } catch (e) {
                    showUploadError("Upload failed with status " + xhr.status);
                }
                uploadBtn.disabled = false;
            }
        });

        xhr.addEventListener("error", () => {
            document.getElementById("loadingIndicator").style.display = "none";
            showUploadError("Network error during upload");
            uploadBtn.disabled = false;
        });

        xhr.open("POST", "/api/upload-bin");
        xhr.send(formData);

    } catch (error) {
        document.getElementById("loadingIndicator").style.display = "none";
        showUploadError("Upload failed: " + error.message);
        uploadBtn.disabled = false;
    }
}

function displayAnalysisResult(result) {
    console.log("displayAnalysisResult called with:", result);

    const resultContainer = document.getElementById("resultContainer");
    const resultFlightId = document.getElementById("resultFlightId");
    const resultFilename = document.getElementById("resultFilename");
    const faultsList = document.getElementById("faultsList");
    const reportText = document.getElementById("reportText");
    const featuresList = document.getElementById("featuresList");

    console.log("Elements found:", {
        resultContainer: !!resultContainer,
        resultFlightId: !!resultFlightId,
        resultFilename: !!resultFilename,
        faultsList: !!faultsList,
        reportText: !!reportText,
        featuresList: !!featuresList
    });

    // Flight info
    if (resultFlightId) {
        resultFlightId.textContent = result.flight_id;
        console.log("Set Flight ID:", result.flight_id);
    }
    if (resultFilename) {
        resultFilename.textContent = result.original_filename;
        console.log("Set Filename:", result.original_filename);
    }

    // Faults
    if (faultsList) {
        faultsList.innerHTML = "";
    } else {
        console.error("faultsList element not found!");
    }
    if (result.faults.length === 0) {
        faultsList.innerHTML = '<p style="color: #0d6b0d; font-weight: 600;">✅ No faults detected</p>';
    } else {
        result.faults.forEach(fault => {
            const severityClass = `fault-${fault.severity.toLowerCase()}`;
            faultsList.innerHTML += `
                <div style="border-left: 4px solid #ff9f43; padding-left: 1rem; padding-top: 0.5rem; padding-bottom: 0.5rem; margin-bottom: 0.75rem;">
                    <p style="font-weight: 600; color: #000000;">${fault.type}</p>
                    <p style="font-size: 0.875rem; color: #333333;">${fault.description}</p>
                    <span class="fault-badge ${severityClass}">${fault.severity}</span>
                    <p style="font-size: 0.75rem; color: #666666; margin-top: 0.25rem;"><strong>Action:</strong> ${fault.recommended_action}</p>
                </div>
            `;
        });
    }

    // Report
    reportText.textContent = result.report;

    // Features
    featuresList.innerHTML = "";
    Object.entries(result.features).forEach(([key, value]) => {
        const displayName = key.replace(/_/g, " ").toUpperCase();
        featuresList.innerHTML += `
            <div style="background-color: #fffaf5; padding: 0.75rem; border-radius: 8px; border: 1px solid #ff9f43;">
                <p style="font-size: 0.75rem; color: #666666;">${displayName}</p>
                <p style="font-size: 1.125rem; font-weight: bold; color: #ff9f43;">${typeof value === "number" ? value.toFixed(3) : value}</p>
            </div>
        `;
    });

    if (resultContainer) {
        resultContainer.style.display = "block";
        resultContainer.style.visibility = "visible";
        console.log("resultContainer displayed:", resultContainer.style.display);
    } else {
        console.error("resultContainer element not found!");
    }

    const errorDiv = document.getElementById("uploadError");
    if (errorDiv) errorDiv.style.display = "none";

    // Show success alert
    alert("✅ Analysis complete! Results showing below.");

    // Scroll to result container
    if (resultContainer) {
        setTimeout(() => {
            resultContainer.scrollIntoView({ behavior: "smooth", block: "start" });
            console.log("Scrolled to resultContainer");
        }, 300);
    }

    // Reload reports in Q&A tab
    loadReports();
}

function showUploadError(message) {
    const errorDiv = document.getElementById("uploadError");
    document.getElementById("uploadErrorMsg").textContent = message;
    errorDiv.style.display = "block";
}

// ──── Q&A SECTION ────────────────────────────────────

async function loadReports() {
    const reportsList = document.getElementById("reportsList");
    reportsList.innerHTML = '<p class="text-gray-500 text-sm">Loading reports...</p>';

    try {
        const response = await fetch("/api/reports?limit=50");
        const data = await response.json();

        reportsList.innerHTML = "";

        if (!data.success || data.reports.length === 0) {
            reportsList.innerHTML = '<p class="text-gray-500 text-sm">No reports yet. Upload a flight to get started.</p>';
            return;
        }

        data.reports.forEach((report, index) => {
            const card = document.createElement("div");
            card.className = "report-card";
            card.style.cursor = "pointer";
            card.style.transition = "all 0.3s";
            card.style.border = "2px solid #ff9f43";
            card.style.borderRadius = "8px";
            card.style.padding = "1rem";
            card.style.backgroundColor = "#ffffff";
            card.id = `report-${report.flight_id}`;
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div style="flex: 1;">
                        <p style="font-weight: 600; font-size: 0.875rem; color: #000000;">${report.flight_id}</p>
                        <p style="font-size: 0.75rem; color: #666666;">${new Date(report.timestamp).toLocaleString()}</p>
                        <p style="font-size: 0.75rem; color: #ff9f43; margin-top: 0.25rem;">🔴 ${report.fault_count} fault${report.fault_count !== 1 ? "s" : ""}</p>
                    </div>
                    <div style="font-size: 1.5rem; color: #ff9f43; display: none;" class="selection-badge">✓</div>
                </div>
            `;

            // Attach click handler for multiple selection
            const handleCardClick = function() {
                console.log("🔥 CARD CLICKED:", report.flight_id);

                // Toggle selection
                const index = selectedFlightIds.indexOf(report.flight_id);
                if (index > -1) {
                    // Already selected, remove it
                    selectedFlightIds.splice(index, 1);
                    card.classList.remove("selected");
                    const badge = card.querySelector(".selection-badge");
                    if (badge) {
                        badge.style.display = "none";
                    }
                    console.log("❌ Deselected:", report.flight_id);
                } else {
                    // Not selected, add it
                    selectedFlightIds.push(report.flight_id);
                    card.classList.add("selected");
                    const badge = card.querySelector(".selection-badge");
                    if (badge) {
                        badge.style.display = "block";
                    }
                    console.log("✅ Selected:", report.flight_id);
                }

                // Update chat display
                updateSelectedFlightsDisplay();
            };

            card.addEventListener("click", handleCardClick);
            console.log(`✅ Click listener attached to card ${index}:`, report.flight_id);
            reportsList.appendChild(card);
        });
    } catch (error) {
        reportsList.innerHTML = `<p class="text-red-600 text-sm">Error loading reports: ${error.message}</p>`;
    }
}

async function viewReportDetail(flightId) {
    console.log("viewReportDetail called for:", flightId);
    currentFlightId = flightId;
    const detailDiv = document.getElementById("reportDetail");

    try {
        const response = await fetch(`/api/report/${flightId}`);
        const data = await response.json();
        console.log("Flight data loaded:", data);

        if (!data.success) {
            alert("Error loading report: " + data.error);
            return;
        }

        // Display report details
        document.getElementById("detailFlightId").textContent = data.flight_id;
        document.getElementById("detailTimestamp").textContent = new Date(data.timestamp).toLocaleString();

        const detailFaults = document.getElementById("detailFaults");
        detailFaults.innerHTML = "";
        if (data.faults.length > 0) {
            data.faults.forEach(fault => {
                const severityClass = `fault-${fault.severity.toLowerCase()}`;
                detailFaults.innerHTML += `
                    <span class="fault-badge ${severityClass}">${fault.type} (${fault.severity})</span>
                `;
            });
        } else {
            detailFaults.innerHTML = '<p style="color: #0d6b0d; font-weight: 600;">✅ No faults detected</p>';
        }

        document.getElementById("detailReport").textContent = data.report;
        detailDiv.classList.remove("hidden");

        // Display selected flight in chat box
        const chatHistory = document.getElementById("chatHistory");
        console.log("Chat history element:", chatHistory);

        const flightCard = document.createElement("div");
        flightCard.style.backgroundColor = "#fff4e6";
        flightCard.style.border = "2px solid #ff9f43";
        flightCard.style.borderRadius = "8px";
        flightCard.style.padding = "1rem";
        flightCard.style.marginBottom = "1rem";
        flightCard.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                    <p style="font-weight: 600; color: #ff9f43; font-size: 0.95rem;">📌 Selected Flight</p>
                    <p style="color: #000000; font-weight: 600; margin-top: 0.25rem;">${data.flight_id}</p>
                    <p style="color: #666666; font-size: 0.875rem; margin-top: 0.25rem;">${new Date(data.timestamp).toLocaleString()}</p>
                </div>
                <button style="background-color: #ff9f43; color: #000000; border: none; border-radius: 50%; width: 36px; height: 36px; cursor: pointer; font-size: 1.2rem; font-weight: bold;">✕</button>
            </div>
        `;

        // Add close button handler
        flightCard.querySelector("button").addEventListener("click", () => {
            console.log("Close button clicked");
            currentFlightId = null;
            chatHistory.innerHTML = "";
            chatHistory.scrollTop = chatHistory.scrollHeight;
        });

        chatHistory.innerHTML = "";
        chatHistory.appendChild(flightCard);
        chatHistory.scrollTop = 0;
        console.log("Flight card added to chat");

    } catch (error) {
        console.error("Error in viewReportDetail:", error);
        alert("Error: " + error.message);
    }
}

// Display all selected flights in chat box
async function updateSelectedFlightsDisplay() {
    const chatHistory = document.getElementById("chatHistory");
    chatHistory.innerHTML = "";

    if (selectedFlightIds.length === 0) {
        chatHistory.innerHTML = '<p style="color: #999999; text-align: center; padding: 2rem;">Select flights from the list to start chatting</p>';
        currentFlightId = null;
        return;
    }

    // Set first selected flight as current for chat
    currentFlightId = selectedFlightIds[0];

    // Create header for selected flights
    const header = document.createElement("div");
    header.style.marginBottom = "1rem";

    // Add each selected flight
    for (const flightId of selectedFlightIds) {
        try {
            const response = await fetch(`/api/report/${flightId}`);
            const data = await response.json();

            if (!data.success) continue;

            const flightCard = document.createElement("div");
            flightCard.style.backgroundColor = "#fff4e6";
            flightCard.style.border = "2px solid #ff9f43";
            flightCard.style.borderRadius = "8px";
            flightCard.style.padding = "1rem";
            flightCard.style.marginBottom = "0.75rem";
            flightCard.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <p style="font-weight: 600; color: #ff9f43; font-size: 0.95rem;">📌 ${selectedFlightIds.length > 1 ? '📍' : '📌'} Flight ${selectedFlightIds.indexOf(flightId) + 1}</p>
                        <p style="color: #000000; font-weight: 600; margin-top: 0.25rem; font-size: 0.9rem;">${data.flight_id}</p>
                        <p style="color: #666666; font-size: 0.875rem; margin-top: 0.25rem;">${new Date(data.timestamp).toLocaleString()}</p>
                    </div>
                    <button onclick="removeSelectedFlight('${flightId}')" style="background-color: #ff9f43; color: #000000; border: none; border-radius: 50%; width: 36px; height: 36px; cursor: pointer; font-size: 1.2rem; font-weight: bold;">✕</button>
                </div>
            `;
            chatHistory.appendChild(flightCard);
        } catch (error) {
            console.error("Error loading flight:", flightId, error);
        }
    }
}

// Remove a flight from selection
function removeSelectedFlight(flightId) {
    const index = selectedFlightIds.indexOf(flightId);
    if (index > -1) {
        selectedFlightIds.splice(index, 1);
    }

    // Update card styling
    const card = document.getElementById(`report-${flightId}`);
    if (card) {
        card.classList.remove("selected");
        const badge = card.querySelector(".selection-badge");
        if (badge) {
            badge.style.display = "none";
        }
    }

    updateSelectedFlightsDisplay();
}

document.getElementById("closeDetailBtn").addEventListener("click", () => {
    document.getElementById("reportDetail").classList.add("hidden");
    currentFlightId = null;
    selectedFlightIds = [];
    document.getElementById("chatHistory").innerHTML = "";
});

// ──── CHAT / RAG ────────────────────────────────────

const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const chatHistory = document.getElementById("chatHistory");
const chatError = document.getElementById("chatError");

sendBtn.addEventListener("click", sendChatMessage);
chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
    }
});

async function sendChatMessage() {
    const query = chatInput.value.trim();

    if (!query) return;

    if (!currentFlightId) {
        chatError.textContent = "⚠️ Please select a flight from the list first to start chatting!";
        chatError.style.display = "block";
        chatError.style.backgroundColor = "#ffe0e0";
        chatError.style.color = "#cc0000";
        chatError.style.padding = "0.75rem";
        chatError.style.borderRadius = "8px";
        chatError.style.marginBottom = "0.5rem";
        return;
    }

    chatError.style.display = "none";
    chatInput.value = "";
    sendBtn.disabled = true;

    // Add user message to chat
    const userMsg = document.createElement("div");
    userMsg.style.display = "flex";
    userMsg.style.justifyContent = "flex-end";
    userMsg.style.marginBottom = "0.5rem";
    userMsg.innerHTML = `
        <div style="background-color: #ff9f43; color: #000000; border-radius: 8px; padding: 0.75rem 1rem; max-width: 70%; word-wrap: break-word;">
            ${escapeHtml(query)}
        </div>
    `;
    chatHistory.appendChild(userMsg);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    // Show loading
    const loadingMsg = document.createElement("div");
    loadingMsg.style.display = "flex";
    loadingMsg.style.justifyContent = "flex-start";
    loadingMsg.style.marginBottom = "0.5rem";
    loadingMsg.innerHTML = `
        <div style="background-color: #f0f0f0; color: #000000; border-radius: 8px; padding: 0.75rem 1rem; border-left: 3px solid #ff9f43;">
            ⏳ Searching flight reports and generating answer...
        </div>
    `;
    chatHistory.appendChild(loadingMsg);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    try {
        const response = await fetch("/api/search-rag", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query: query,
                flight_id: currentFlightId,
                n_results: 3
            })
        });

        const data = await response.json();
        loadingMsg.remove();

        if (data.success) {
            const assistantMsg = document.createElement("div");
            assistantMsg.style.display = "flex";
            assistantMsg.style.justifyContent = "flex-start";
            assistantMsg.style.marginBottom = "0.75rem";
            assistantMsg.innerHTML = `
                <div style="background-color: #ffffff; color: #000000; border-radius: 8px; padding: 0.75rem 1rem; max-width: 70%; word-wrap: break-word; border-left: 4px solid #ff9f43; border: 1px solid #ff9f43; line-height: 1.5;">
                    <div style="color: #000000; font-size: 0.95rem;">${escapeHtml(data.answer)}</div>
                    <p style="font-size: 0.75rem; color: #666666; margin-top: 0.75rem; padding-top: 0.5rem; border-top: 1px solid #f0f0f0;">
                        📍 Based on: ${data.relevant_flights.join(", ")}
                    </p>
                </div>
            `;
            chatHistory.appendChild(assistantMsg);
        } else {
            const errorMsg = document.createElement("div");
            errorMsg.style.display = "flex";
            errorMsg.style.justifyContent = "flex-start";
            errorMsg.style.marginBottom = "0.5rem";
            errorMsg.innerHTML = `
                <div style="background-color: #ffe0e0; color: #cc0000; border-radius: 8px; padding: 0.75rem 1rem;">
                    ❌ ${escapeHtml(data.error)}
                </div>
            `;
            chatHistory.appendChild(errorMsg);
        }

        chatHistory.scrollTop = chatHistory.scrollHeight;

    } catch (error) {
        loadingMsg.remove();
        const errorMsg = document.createElement("div");
        errorMsg.style.display = "flex";
        errorMsg.style.justifyContent = "flex-start";
        errorMsg.style.marginBottom = "0.5rem";
        errorMsg.innerHTML = `
            <div style="background-color: #ffe0e0; color: #cc0000; border-radius: 8px; padding: 0.75rem 1rem;">
                ❌ Error: ${escapeHtml(error.message)}
            </div>
        `;
        chatHistory.appendChild(errorMsg);
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    sendBtn.disabled = false;
}

// ──── FLEET SUMMARY ────────────────────────────────────

async function loadFleetSummary() {
    try {
        const response = await fetch("/api/fleet-summary");
        const data = await response.json();

        if (data.success) {
            const summary = data.summary;
            const summaryDiv = document.getElementById("fleetSummary");
            summaryDiv.innerHTML = `
                <div class="text-center">
                    <p class="text-3xl font-bold text-blue-600">${summary.total_flights}</p>
                    <p class="text-sm text-gray-600">Total Flights</p>
                </div>
                <div class="text-center">
                    <p class="text-2xl font-bold text-orange-600">${summary.avg_faults_per_flight}</p>
                    <p class="text-sm text-gray-600">Avg Faults/Flight</p>
                </div>
                <div class="text-center">
                    <p class="text-2xl font-bold text-purple-600">${summary.avg_flight_duration_s}s</p>
                    <p class="text-sm text-gray-600">Avg Flight Duration</p>
                </div>
                <div class="text-center">
                    <p class="text-2xl font-bold text-green-600">${summary.avg_peak_vibration.toFixed(4)}</p>
                    <p class="text-sm text-gray-600">Avg Peak Vibration</p>
                </div>
            `;
        }
    } catch (error) {
        console.error("Error loading fleet summary:", error);
    }
}

// ──── UTILITIES ────────────────────────────────────

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// ──── INIT ────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
    loadFleetSummary();
});
