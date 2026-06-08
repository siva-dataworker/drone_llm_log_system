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
        faultsList.innerHTML = '<p class="text-green-600 font-semibold">✅ No faults detected</p>';
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
        const data = await response.json();

        reportsList.innerHTML = "";

        if (!data.success || data.reports.length === 0) {
            reportsList.innerHTML = '<p class="text-gray-500 text-sm">No reports yet. Upload a flight to get started.</p>';
            return;
        }

        data.reports.forEach(report => {
            const card = document.createElement("div");
            card.className = "report-card";
            card.innerHTML = `
                <p class="font-semibold text-sm text-gray-800">${report.flight_id}</p>
                <p class="text-xs text-gray-600">${new Date(report.timestamp).toLocaleString()}</p>
                <p class="text-xs text-blue-600 mt-1">🔴 ${report.fault_count} fault${report.fault_count !== 1 ? "s" : ""}</p>
            `;
            card.addEventListener("click", () => viewReportDetail(report.flight_id));
            reportsList.appendChild(card);
        });
    } catch (error) {
        reportsList.innerHTML = `<p class="text-red-600 text-sm">Error loading reports: ${error.message}</p>`;
    }
}

async function viewReportDetail(flightId) {
    currentFlightId = flightId;
    const detailDiv = document.getElementById("reportDetail");

    try {
        const response = await fetch(`/api/report/${flightId}`);
        const data = await response.json();

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
            detailFaults.innerHTML = '<p class="text-green-600 text-sm">✅ No faults detected</p>';
        }

        document.getElementById("detailReport").textContent = data.report;
        detailDiv.classList.remove("hidden");

        // Clear chat history
        document.getElementById("chatHistory").innerHTML = "";
        document.getElementById("chatInput").value = "";

    } catch (error) {
        alert("Error: " + error.message);
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

    if (!currentFlightId) {
        chatError.textContent = "Please select a flight first";
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
        <div class="bg-blue-600 text-white rounded-lg px-4 py-3 max-w-xs">
            ${escapeHtml(query)}
        </div>
    `;
    chatHistory.appendChild(userMsg);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    // Show loading
    const loadingMsg = document.createElement("div");
    loadingMsg.className = "flex justify-start";
    loadingMsg.innerHTML = `
        <div class="bg-gray-300 text-gray-800 rounded-lg px-4 py-3">
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
            assistantMsg.className = "flex justify-start";
            assistantMsg.innerHTML = `
                <div class="bg-gray-200 text-gray-800 rounded-lg px-4 py-3 max-w-lg">
                    <div>${escapeHtml(data.answer)}</div>
                    <p class="text-xs text-gray-600 mt-2">
                        📍 Based on: ${data.relevant_flights.join(", ")}
                    </p>
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
