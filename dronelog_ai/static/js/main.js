// ════════════════════════════════════════════════════════
// DRONELOG AI - FRONTEND LOGIC
// ════════════════════════════════════════════════════════

// ──── STATE ────────────────────────────────────────────
let currentFlightId = null;
let uploadedFile = null;

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

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");

// Drag & drop
dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("bg-blue-50");
});

dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("bg-blue-50");
});

dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("bg-blue-50");
    handleFiles(e.dataTransfer.files);
});

dropzone.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
    handleFiles(e.target.files);
});

function handleFiles(files) {
    if (files.length === 0) return;

    const file = files[0];

    if (!file.name.endsWith(".bin")) {
        showUploadError("Only .bin files allowed");
        return;
    }

    uploadedFile = file;
    uploadBtn.disabled = false;
    uploadBtn.textContent = `📤 Ready: ${file.name}`;
}

uploadBtn.addEventListener("click", uploadAndAnalyze);

async function uploadAndAnalyze() {
    if (!uploadedFile) return;

    uploadBtn.disabled = true;
    document.getElementById("uploadError").classList.add("hidden");

    const formData = new FormData();
    formData.append("file", uploadedFile);

    // Show progress
    const progressContainer = document.getElementById("progressContainer");
    const progressBar = document.getElementById("progressBar");
    const progressText = document.getElementById("progressText");

    progressContainer.classList.remove("hidden");

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
            if (xhr.status === 200) {
                const result = JSON.parse(xhr.responseText);
                displayAnalysisResult(result);
                uploadedFile = null;
                uploadBtn.disabled = true;
                uploadBtn.textContent = "📤 Upload & Process";
                progressContainer.classList.add("hidden");
                progressBar.style.width = "0%";
            } else {
                const error = JSON.parse(xhr.responseText);
                showUploadError(error.error);
                uploadBtn.disabled = false;
            }
        });

        xhr.addEventListener("error", () => {
            showUploadError("Network error during upload");
            uploadBtn.disabled = false;
        });

        xhr.open("POST", "/api/upload-bin");
        xhr.send(formData);

    } catch (error) {
        showUploadError("Upload failed: " + error.message);
        uploadBtn.disabled = false;
    }
}

function displayAnalysisResult(result) {
    const resultContainer = document.getElementById("resultContainer");
    const resultFlightId = document.getElementById("resultFlightId");
    const resultFilename = document.getElementById("resultFilename");
    const faultsList = document.getElementById("faultsList");
    const reportText = document.getElementById("reportText");
    const featuresList = document.getElementById("featuresList");

    // Flight info
    resultFlightId.textContent = result.flight_id;
    resultFilename.textContent = result.original_filename;

    // Faults
    faultsList.innerHTML = "";
    if (result.faults.length === 0) {
        faultsList.innerHTML = '<p class="text-orange-500 font-semibold">✅ No faults detected</p>';
    } else {
        result.faults.forEach(fault => {
            const severityClass = `fault-${fault.severity.toLowerCase()}`;
            faultsList.innerHTML += `
                <div class="border-l-4 border-gray-300 pl-4 py-2">
                    <p class="font-semibold text-gray-800">${fault.type}</p>
                    <p class="text-sm text-gray-600">${fault.description}</p>
                    <span class="fault-badge ${severityClass}">${fault.severity}</span>
                    <p class="text-xs text-gray-500 mt-1"><strong>Action:</strong> ${fault.recommended_action}</p>
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
            <div class="bg-gray-50 p-3 rounded">
                <p class="text-xs text-gray-600">${displayName}</p>
                <p class="text-lg font-bold text-blue-600">${typeof value === "number" ? value.toFixed(3) : value}</p>
            </div>
        `;
    });

    resultContainer.classList.remove("hidden");
    document.getElementById("uploadError").classList.add("hidden");

    // Reload reports in Q&A tab
    loadReports();
}

function showUploadError(message) {
    const errorDiv = document.getElementById("uploadError");
    document.getElementById("uploadErrorMsg").textContent = message;
    errorDiv.classList.remove("hidden");
}

// ──── Q&A SECTION ────────────────────────────────────

async function loadReports() {
    const reportsList = document.getElementById("reportsList");
    reportsList.innerHTML = '<p class="text-gray-500 text-sm">Loading reports...</p>';

    try {
        const response = await fetch("/api/reports?limit=50");

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        reportsList.innerHTML = "";

        if (!data.success || !data.reports || data.reports.length === 0) {
            reportsList.innerHTML = '<p class="text-gray-500 text-sm">No reports yet. Upload a flight to get started.</p>';
            return;
        }

        data.reports.forEach(report => {
            const card = document.createElement("div");
            card.className = "report-card";
            card.dataset.flightId = report.flight_id;
            card.style.cursor = "pointer";

            card.innerHTML = `
                <p class="font-semibold text-sm text-gray-800">${escapeHtml(report.flight_id)}</p>
                <p class="text-xs text-gray-600">${new Date(report.timestamp).toLocaleString()}</p>
                <p class="text-xs text-blue-600 mt-1">🔴 ${report.fault_count} fault${report.fault_count !== 1 ? "s" : ""}</p>
            `;

            // Attach click handler
            const handleClick = (e) => {
                e.preventDefault();
                e.stopPropagation();

                // Remove selected from all cards
                document.querySelectorAll(".report-card").forEach(c => c.classList.remove("selected"));
                // Add selected to clicked card
                card.classList.add("selected");

                // Call view function
                viewReportDetail(report.flight_id);
            };

            card.addEventListener("click", handleClick, false);

            // Also handle touch for mobile
            card.addEventListener("touchend", handleClick, false);

            reportsList.appendChild(card);
        });

        console.log(`Loaded ${data.reports.length} flight reports`);

    } catch (error) {
        console.error("Error loading reports:", error);
        reportsList.innerHTML = `<p class="text-red-600 text-sm">Error: ${escapeHtml(error.message)}</p>`;
    }
}

async function viewReportDetail(flightId) {
    if (!flightId) {
        console.error("No flight ID provided");
        return;
    }

    currentFlightId = flightId;
    const detailDiv = document.getElementById("reportDetail");

    try {
        console.log(`Loading report for flight: ${flightId}`);

        const response = await fetch(`/api/report/${flightId}`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.success) {
            console.error("API returned error:", data.error);
            alert("Error loading report: " + (data.error || "Unknown error"));
            return;
        }

        console.log("Report loaded successfully:", data.flight_id);

        // Display report details
        document.getElementById("detailFlightId").textContent = data.flight_id;
        document.getElementById("detailTimestamp").textContent = new Date(data.timestamp).toLocaleString();

        const detailFaults = document.getElementById("detailFaults");
        detailFaults.innerHTML = "";

        if (data.faults && data.faults.length > 0) {
            data.faults.forEach(fault => {
                const severityClass = `fault-${fault.severity.toLowerCase()}`;
                const faultHtml = `
                    <span class="fault-badge ${severityClass}">
                        ${escapeHtml(fault.type)} (${fault.severity})
                    </span>
                `;
                detailFaults.innerHTML += faultHtml;
            });
        } else {
            detailFaults.innerHTML = '<p class="text-orange-500 text-sm">✅ No faults detected</p>';
        }

        // Clean up report text (remove markdown)
        let reportText = data.report || "";
        reportText = reportText
            .replace(/\*\*([^*]+)\*\*/g, '$1')  // Remove **bold**
            .replace(/###\s/g, '')               // Remove ### headers
            .replace(/##\s/g, '')                // Remove ## headers
            .replace(/#\s/g, '');                // Remove # headers

        document.getElementById("detailReport").textContent = reportText;
        detailDiv.classList.remove("hidden");

        // Clear chat history when switching flights
        document.getElementById("chatHistory").innerHTML = "";
        document.getElementById("chatInput").value = "";
        document.getElementById("chatError").classList.add("hidden");

    } catch (error) {
        console.error("Error loading report:", error);
        alert("Error loading report: " + error.message);
    }
}

document.getElementById("closeDetailBtn").addEventListener("click", () => {
    document.getElementById("reportDetail").classList.add("hidden");
    currentFlightId = null;
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

    // For general chat (greetings), flight selection is optional
    const generalKeywords = ["hi", "hello", "hey", "help", "what can you do", "how does this work"];
    const isGeneralChat = generalKeywords.some(kw => query.toLowerCase().includes(kw));

    if (!currentFlightId && !isGeneralChat) {
        chatError.textContent = "Please select a flight first to ask flight-specific questions";
        chatError.classList.remove("hidden");
        return;
    }

    chatError.classList.add("hidden");
    chatInput.value = "";
    sendBtn.disabled = true;

    // Add user message to chat
    const userMsg = document.createElement("div");
    userMsg.className = "flex justify-end";
    userMsg.innerHTML = `
        <div style="background-color: #2a1f0f; color: #ff9f43;" class="rounded-lg px-4 py-3 max-w-xs">
            ${escapeHtml(query)}
        </div>
    `;
    chatHistory.appendChild(userMsg);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    // Show loading
    const loadingMsg = document.createElement("div");
    loadingMsg.className = "flex justify-start";
    loadingMsg.innerHTML = `
        <div style="background-color: #1a2e2e; color: #888888; border-left: 3px solid #ff9f43;" class="rounded-lg px-4 py-3">
            ⏳ Searching flight reports and generating answer...
        </div>
    `;
    chatHistory.appendChild(loadingMsg);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    try {
        // For general chat, don't send flight_id
        const requestBody = {
            query: query,
            n_results: 3
        };

        // Only add flight_id for flight-specific questions
        if (!isGeneralChat && currentFlightId) {
            requestBody.flight_id = currentFlightId;
        }

        const response = await fetch("/api/search-rag", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        loadingMsg.remove();

        if (data.success) {
            const assistantMsg = document.createElement("div");
            assistantMsg.className = "flex justify-start";

            // Clean up markdown formatting from LLM response
            let cleanAnswer = data.answer
                .replace(/\*\*([^*]+)\*\*/g, '$1')  // Remove **bold**
                .replace(/\*([^*]+)\*/g, '$1')      // Remove *italic*
                .replace(/###\s/g, '')               // Remove ### headers
                .replace(/##\s/g, '')                // Remove ## headers
                .replace(/#\s/g, '');                // Remove # headers

            // Build sources section based on intent and results
            let sourcesHtml = "";
            let bgColor = "#1a2e2e";
            let textColor = "#e0e0e0";
            let borderColor = "#ff9f43";

            if (data.intent === "GREETING") {
                // Greeting responses
                bgColor = "#2a1f0f";
                borderColor = "#ff9f43";
                sourcesHtml = `<p class="text-xs mt-2" style="color: #ff9f43;">💬 General chat</p>`;
            } else if (data.is_general_chat) {
                // General chat fallback
                sourcesHtml = `<p class="text-xs mt-2 italic" style="color: #888888;">General assistance</p>`;
            } else if (data.relevant_flights && data.relevant_flights.length > 0) {
                // Search with results
                bgColor = "#2a1f0f";
                borderColor = "#ff9f43";
                const flightList = data.relevant_flights
                    .map((f, i) => `${f} (${(data.relevance_scores[i] * 100).toFixed(0)}%)`)
                    .join(", ");
                sourcesHtml = `<p class="text-xs mt-2" style="color: #ff9f43;">📍 Based on: ${flightList}</p>`;
            } else {
                // Search with no results
                sourcesHtml = `<p class="text-xs mt-2" style="color: #ffa500;">⚠️ No matching flight data found</p>`;
            }

            assistantMsg.innerHTML = `
                <div class="rounded-lg px-4 py-3 max-w-lg" style="background-color: ${bgColor}; color: ${textColor}; border-left: 3px solid ${borderColor};">
                    <div>${escapeHtml(cleanAnswer)}</div>
                    ${sourcesHtml}
                </div>
            `;
            chatHistory.appendChild(assistantMsg);
        } else {
            const errorMsg = document.createElement("div");
            errorMsg.className = "flex justify-start";
            errorMsg.innerHTML = `
                <div class="bg-red-100 text-red-800 rounded-lg px-4 py-3">
                    ❌ ${escapeHtml(data.error)}
                </div>
            `;
            chatHistory.appendChild(errorMsg);
        }

        chatHistory.scrollTop = chatHistory.scrollHeight;

    } catch (error) {
        loadingMsg.remove();
        const errorMsg = document.createElement("div");
        errorMsg.className = "flex justify-start";
        errorMsg.innerHTML = `
            <div class="bg-red-100 text-red-800 rounded-lg px-4 py-3">
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
                    <p class="text-2xl font-bold text-orange-500">${summary.avg_peak_vibration.toFixed(4)}</p>
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
