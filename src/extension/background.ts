/// <reference types="chrome"/>
// src/extension/background.ts
console.log("School Portal Pro+ background service worker loaded.");

// This will handle communication between the content script and the AI/Firebase
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyzePage") {
    console.log("Analyzing page content...");
    // Here we will call Gemini API
    sendResponse({ status: "success", data: "Analysis result" });
  }
});
