"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessingHelper = void 0;
// ProcessingHelper.ts
const node_fs_1 = __importDefault(require("node:fs"));
const axios = __importStar(require("axios"));
const electron_1 = require("electron");
const ConfigHelper_1 = require("./ConfigHelper");
const openai_1 = require("openai");
class ProcessingHelper {
    constructor(deps) {
        this.openaiClient = null;
        this.geminiApiKey = null;
        // AbortControllers for API requests
        this.currentProcessingAbortController = null;
        this.currentExtraProcessingAbortController = null;
        this.deps = deps;
        this.screenshotHelper = deps.getScreenshotHelper();
        // Initialize AI client based on config
        this.initializeAIClient();
        // Listen for config changes to re-initialize the AI client
        ConfigHelper_1.configHelper.on('config-updated', () => {
            this.initializeAIClient();
        });
    }
    /**
     * Initialize or reinitialize the AI client with current config
     */
    initializeAIClient() {
        try {
            const config = ConfigHelper_1.configHelper.loadConfig();
            if (config.apiProvider === "openai") {
                if (config.apiKey) {
                    this.openaiClient = new openai_1.AzureOpenAI({
                        endpoint: "https://vista-pathfinding.openai.azure.com/",
                        apiKey: config.apiKey,
                        apiVersion: "2025-03-01-preview",
                        timeout: 60000, // 60 second timeout
                        maxRetries: 2, // Retry up to 2 times
                        deployment: "vista-rcacopilot"
                    });
                    this.geminiApiKey = null;
                    console.log("OpenAI client initialized successfully");
                }
                else {
                    this.openaiClient = null;
                    this.geminiApiKey = null;
                    console.warn("No API key available, OpenAI client not initialized");
                }
            }
            else {
                // Gemini client initialization
                this.openaiClient = null;
                if (config.apiKey) {
                    this.geminiApiKey = config.apiKey;
                    console.log("Gemini API key set successfully");
                }
                else {
                    this.geminiApiKey = null;
                    console.warn("No API key available, Gemini client not initialized");
                }
            }
        }
        catch (error) {
            console.error("Failed to initialize AI client:", error);
            this.openaiClient = null;
            this.geminiApiKey = null;
        }
    }
    async waitForInitialization(mainWindow) {
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds total
        while (attempts < maxAttempts) {
            const isInitialized = await mainWindow.webContents.executeJavaScript("window.__IS_INITIALIZED__");
            if (isInitialized)
                return;
            await new Promise((resolve) => setTimeout(resolve, 100));
            attempts++;
        }
        throw new Error("App failed to initialize after 5 seconds");
    }
    async getCredits() {
        const mainWindow = this.deps.getMainWindow();
        if (!mainWindow)
            return 999; // Unlimited credits in this version
        try {
            await this.waitForInitialization(mainWindow);
            return 999; // Always return sufficient credits to work
        }
        catch (error) {
            console.error("Error getting credits:", error);
            return 999; // Unlimited credits as fallback
        }
    }
    async getLanguage() {
        try {
            // Get language from config
            const config = ConfigHelper_1.configHelper.loadConfig();
            if (config.language) {
                return config.language;
            }
            // Fallback to window variable if config doesn't have language
            const mainWindow = this.deps.getMainWindow();
            if (mainWindow) {
                try {
                    await this.waitForInitialization(mainWindow);
                    const language = await mainWindow.webContents.executeJavaScript("window.__LANGUAGE__");
                    if (typeof language === "string" &&
                        language !== undefined &&
                        language !== null) {
                        return language;
                    }
                }
                catch (err) {
                    console.warn("Could not get language from window", err);
                }
            }
            // Default fallback
            return "python";
        }
        catch (error) {
            console.error("Error getting language:", error);
            return "python";
        }
    }
    async processScreenshots() {
        const mainWindow = this.deps.getMainWindow();
        if (!mainWindow)
            return;
        const config = ConfigHelper_1.configHelper.loadConfig();
        // First verify we have a valid AI client
        if (config.apiProvider === "openai" && !this.openaiClient) {
            this.initializeAIClient();
            if (!this.openaiClient) {
                console.error("OpenAI client not initialized");
                mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.API_KEY_INVALID);
                return;
            }
        }
        else if (config.apiProvider === "gemini" && !this.geminiApiKey) {
            this.initializeAIClient();
            if (!this.geminiApiKey) {
                console.error("Gemini API key not initialized");
                mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.API_KEY_INVALID);
                return;
            }
        }
        const view = this.deps.getView();
        console.log("Processing screenshots in view:", view);
        if (view === "queue") {
            mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.INITIAL_START);
            const screenshotQueue = this.screenshotHelper.getScreenshotQueue();
            console.log("Processing main queue screenshots:", screenshotQueue);
            // Check if the queue is empty
            if (!screenshotQueue || screenshotQueue.length === 0) {
                console.log("No screenshots found in queue");
                mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
                // Show dialog if no screenshots
                electron_1.dialog.showMessageBox(mainWindow, {
                    type: 'info',
                    title: 'No Screenshots Detected',
                    message: 'No screenshots were found to process.',
                    detail: 'Please take a screenshot first using Ctrl+H (or Cmd+H on Mac). Make sure your screenshot contains the coding problem you want to solve.',
                    buttons: ['OK']
                });
                return;
            }
            // Check that files actually exist
            const existingScreenshots = screenshotQueue.filter(path => node_fs_1.default.existsSync(path));
            if (existingScreenshots.length === 0) {
                console.log("Screenshot files don't exist on disk");
                mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
                // Show error dialog
                electron_1.dialog.showMessageBox(mainWindow, {
                    type: 'warning',
                    title: 'Screenshot Files Missing',
                    message: 'The screenshot files were not found on disk.',
                    detail: 'Try taking a new screenshot with Ctrl+H (or Cmd+H on Mac).',
                    buttons: ['OK']
                });
                return;
            }
            try {
                // Initialize AbortController
                this.currentProcessingAbortController = new AbortController();
                const { signal } = this.currentProcessingAbortController;
                const screenshots = await Promise.all(existingScreenshots.map(async (path) => {
                    try {
                        return {
                            path,
                            preview: await this.screenshotHelper.getImagePreview(path),
                            data: node_fs_1.default.readFileSync(path).toString('base64')
                        };
                    }
                    catch (err) {
                        console.error(`Error reading screenshot ${path}:`, err);
                        return null;
                    }
                }));
                // Filter out any nulls from failed screenshots
                const validScreenshots = screenshots.filter(Boolean);
                if (validScreenshots.length === 0) {
                    throw new Error("Failed to load screenshot data");
                }
                const result = await this.processScreenshotsHelper(validScreenshots, signal);
                if (!result.success) {
                    console.log("Processing failed:", result.error);
                    if (result.error?.includes("API Key") || result.error?.includes("OpenAI") || result.error?.includes("Gemini")) {
                        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.API_KEY_INVALID);
                    }
                    else {
                        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, result.error);
                    }
                    // Reset view back to queue on error
                    console.log("Resetting view to queue due to error");
                    this.deps.setView("queue");
                    return;
                }
                // Only set view to solutions if processing succeeded
                console.log("Setting view to solutions after successful processing");
                mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.SOLUTION_SUCCESS, result.data);
                this.deps.setView("solutions");
            }
            catch (error) {
                mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, error);
                console.error("Processing error:", error);
                if (axios.isCancel(error)) {
                    mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, "Processing was canceled by the user.");
                }
                else {
                    mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, error.message || "Server error. Please try again.");
                }
                // Reset view back to queue on error
                console.log("Resetting view to queue due to error");
                this.deps.setView("queue");
            }
            finally {
                this.currentProcessingAbortController = null;
            }
        }
        else {
            // view == 'solutions'
            const extraScreenshotQueue = this.screenshotHelper.getExtraScreenshotQueue();
            console.log("Processing extra queue screenshots:", extraScreenshotQueue);
            // Check if the extra queue is empty
            if (!extraScreenshotQueue || extraScreenshotQueue.length === 0) {
                console.log("No extra screenshots found in queue");
                mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
                // Show dialog if no screenshots
                electron_1.dialog.showMessageBox(mainWindow, {
                    type: 'info',
                    title: 'No Debug Screenshots',
                    message: 'No screenshots were found for debugging.',
                    detail: 'Please take screenshots of your code/errors with Ctrl+H before debugging.',
                    buttons: ['OK']
                });
                return;
            }
            // Check that files actually exist
            const existingExtraScreenshots = extraScreenshotQueue.filter(path => node_fs_1.default.existsSync(path));
            if (existingExtraScreenshots.length === 0) {
                console.log("Extra screenshot files don't exist on disk");
                mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
                electron_1.dialog.showMessageBox(mainWindow, {
                    type: 'warning',
                    title: 'Screenshot Files Missing',
                    message: 'The debug screenshot files were not found.',
                    detail: 'Try taking a new screenshot with Ctrl+H (or Cmd+H on Mac).',
                    buttons: ['OK']
                });
                return;
            }
            mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.DEBUG_START);
            // Initialize AbortController
            this.currentExtraProcessingAbortController = new AbortController();
            const { signal } = this.currentExtraProcessingAbortController;
            try {
                // Get all screenshots (both main and extra) for processing
                const allPaths = [
                    ...this.screenshotHelper.getScreenshotQueue(),
                    ...existingExtraScreenshots
                ];
                const screenshots = await Promise.all(allPaths.map(async (path) => {
                    try {
                        if (!node_fs_1.default.existsSync(path)) {
                            console.warn(`Screenshot file does not exist: ${path}`);
                            return null;
                        }
                        return {
                            path,
                            preview: await this.screenshotHelper.getImagePreview(path),
                            data: node_fs_1.default.readFileSync(path).toString('base64')
                        };
                    }
                    catch (err) {
                        console.error(`Error reading screenshot ${path}:`, err);
                        return null;
                    }
                }));
                // Filter out any nulls from failed screenshots
                const validScreenshots = screenshots.filter(Boolean);
                if (validScreenshots.length === 0) {
                    throw new Error("Failed to load screenshot data for debugging");
                }
                console.log("Combined screenshots for processing:", validScreenshots.map((s) => s.path));
                const result = await this.processExtraScreenshotsHelper(validScreenshots, signal);
                if (result.success) {
                    this.deps.setHasDebugged(true);
                    mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.DEBUG_SUCCESS, result.data);
                }
                else {
                    mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.DEBUG_ERROR, result.error);
                }
            }
            catch (error) {
                if (axios.isCancel(error)) {
                    mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.DEBUG_ERROR, "Extra processing was canceled by the user.");
                }
                else {
                    mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.DEBUG_ERROR, error.message);
                }
            }
            finally {
                this.currentExtraProcessingAbortController = null;
            }
        }
    }
    async processScreenshotsHelper(screenshots, signal) {
        try {
            const config = ConfigHelper_1.configHelper.loadConfig();
            const language = await this.getLanguage();
            const mainWindow = this.deps.getMainWindow();
            // Step 1: Extract problem info using AI Vision API (OpenAI or Gemini)
            const imageDataList = screenshots.map(screenshot => screenshot.data);
            // Update the user on progress
            if (mainWindow) {
                mainWindow.webContents.send("processing-status", {
                    message: "Analyzing problem from screenshots...",
                    progress: 20
                });
            }
            let problemInfo;
            if (config.apiProvider === "openai") {
                // Verify OpenAI client
                if (!this.openaiClient) {
                    this.initializeAIClient(); // Try to reinitialize
                    if (!this.openaiClient) {
                        return {
                            success: false,
                            error: "OpenAI API key not configured or invalid. Please check your settings."
                        };
                    }
                }
                // Use OpenAI for processing
                const messages = [
                    {
                        role: "system",
                        content: "You are a coding challenge interpreter. Analyze the screenshot of the coding problem and extract all relevant information. Return the information in JSON format with these fields: problem_statement, constraints, example_input, example_output. Just return the structured JSON without any other text."
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: `Extract the coding problem details from these screenshots. Return in JSON format. Preferred coding language we gonna use for this problem is ${language}.`
                            },
                            ...imageDataList.map(data => ({
                                type: "image_url",
                                image_url: { url: `data:image/png;base64,${data}` }
                            }))
                        ]
                    }
                ];
                // Send to OpenAI Vision API
                const extractionResponse = await this.openaiClient.chat.completions.create({
                    model: config.extractionModel || "gpt-4o",
                    messages: messages,
                    max_tokens: 4000,
                    temperature: 0.2
                });
                // Parse the response
                try {
                    const responseText = extractionResponse.choices[0].message.content;
                    // Handle when OpenAI might wrap the JSON in markdown code blocks
                    const jsonText = responseText.replace(/```json|```/g, '').trim();
                    problemInfo = JSON.parse(jsonText);
                }
                catch (error) {
                    console.error("Error parsing OpenAI response:", error);
                    return {
                        success: false,
                        error: "Failed to parse problem information. Please try again or use clearer screenshots."
                    };
                }
            }
            else {
                // Use Gemini API
                if (!this.geminiApiKey) {
                    return {
                        success: false,
                        error: "Gemini API key not configured. Please check your settings."
                    };
                }
                try {
                    // Create Gemini message structure
                    const geminiMessages = [
                        {
                            role: "user",
                            parts: [
                                {
                                    text: `You are a coding challenge interpreter. Analyze the screenshots of the coding problem and extract all relevant information. Return the information in JSON format with these fields: problem_statement, constraints, example_input, example_output. Just return the structured JSON without any other text. Preferred coding language we gonna use for this problem is ${language}.`
                                },
                                ...imageDataList.map(data => ({
                                    inlineData: {
                                        mimeType: "image/png",
                                        data: data
                                    }
                                }))
                            ]
                        }
                    ];
                    // Make API request to Gemini
                    const response = await axios.default.post(`https://generativelanguage.googleapis.com/v1beta/models/${config.extractionModel || "gemini-2.0-flash"}:generateContent?key=${this.geminiApiKey}`, {
                        contents: geminiMessages,
                        generationConfig: {
                            temperature: 0.2,
                            maxOutputTokens: 4000
                        }
                    }, { signal });
                    const responseData = response.data;
                    if (!responseData.candidates || responseData.candidates.length === 0) {
                        throw new Error("Empty response from Gemini API");
                    }
                    const responseText = responseData.candidates[0].content.parts[0].text;
                    // Handle when Gemini might wrap the JSON in markdown code blocks
                    const jsonText = responseText.replace(/```json|```/g, '').trim();
                    problemInfo = JSON.parse(jsonText);
                }
                catch (error) {
                    console.error("Error using Gemini API:", error);
                    return {
                        success: false,
                        error: "Failed to process with Gemini API. Please check your API key or try again later."
                    };
                }
            }
            // Update the user on progress
            if (mainWindow) {
                mainWindow.webContents.send("processing-status", {
                    message: "Problem analyzed successfully. Preparing to generate solution...",
                    progress: 40
                });
            }
            // Store problem info in AppState
            this.deps.setProblemInfo(problemInfo);
            // Send first success event
            if (mainWindow) {
                mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.PROBLEM_EXTRACTED, problemInfo);
                // Generate solutions after successful extraction
                const solutionsResult = await this.generateSolutionsHelper(signal);
                if (solutionsResult.success) {
                    // Clear any existing extra screenshots before transitioning to solutions view
                    this.screenshotHelper.clearExtraScreenshotQueue();
                    // Final progress update
                    mainWindow.webContents.send("processing-status", {
                        message: "Solution generated successfully",
                        progress: 100
                    });
                    mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.SOLUTION_SUCCESS, solutionsResult.data);
                    return { success: true, data: solutionsResult.data };
                }
                else {
                    throw new Error(solutionsResult.error || "Failed to generate solutions");
                }
            }
            return { success: false, error: "Failed to process screenshots" };
        }
        catch (error) {
            // If the request was cancelled, don't retry
            if (axios.isCancel(error)) {
                return {
                    success: false,
                    error: "Processing was canceled by the user."
                };
            }
            // Handle OpenAI API errors specifically
            if (error?.response?.status === 401) {
                return {
                    success: false,
                    error: "Invalid OpenAI API key. Please check your settings."
                };
            }
            else if (error?.response?.status === 429) {
                return {
                    success: false,
                    error: "OpenAI API rate limit exceeded or insufficient credits. Please try again later."
                };
            }
            else if (error?.response?.status === 500) {
                return {
                    success: false,
                    error: "OpenAI server error. Please try again later."
                };
            }
            console.error("API Error Details:", error);
            return {
                success: false,
                error: error.message || "Failed to process screenshots. Please try again."
            };
        }
    }
    async generateSolutionsHelper(signal) {
        try {
            const problemInfo = this.deps.getProblemInfo();
            const language = await this.getLanguage();
            const config = ConfigHelper_1.configHelper.loadConfig();
            const mainWindow = this.deps.getMainWindow();
            if (!problemInfo) {
                throw new Error("No problem info available");
            }
            // Update progress status
            if (mainWindow) {
                mainWindow.webContents.send("processing-status", {
                    message: "Creating optimal solution with detailed explanations...",
                    progress: 60
                });
            }
            // Create prompt for solution generation
            const promptText = `
Generate a detailed solution for the following coding problem:

PROBLEM STATEMENT:
${problemInfo.problem_statement}

CONSTRAINTS:
${problemInfo.constraints || "No specific constraints provided."}

EXAMPLE INPUT:z
${problemInfo.example_input || "No example input provided."}

EXAMPLE OUTPUT:
${problemInfo.example_output || "No example output provided."}

LANGUAGE: ${language}

I need the response in the following format if a coding problem is detected:
1. Code: A clean, optimized implementation in ${language}
2. Your Thoughts: A list of step by step thoughts in casual language on how you approached the problem 
3. Time complexity: O(X) with a detailed explanation (at least 2 sentences)
4. Space complexity: O(X) with a detailed explanation  (at least 2 sentences)

For complexity explanations, please be thorough. For example: "Time complexity: O(n) because we iterate through the array only once. This is optimal as we need to examine each element at least once to find the solution." or "Space complexity: O(n) because in the worst case, we store all elements in the hashmap. The additional space scales linearly with the input size."

Your solution should be efficient, well-commented, use traditional loop structures and variable assignments, avoid single-line shortcuts and handle edge cases.

I need the response in the following format if a system design problem is detected:
1. System Design: A high-level overview of the system architecture, including key components and their interactions.
2. Database Schema: A detailed description of the database schema, including tables, fields, and relationships.
3. API Endpoints: A list of API endpoints, including request/response formats and authentication requirements.
4. Scalability Considerations: A discussion of how the system can be scaled to handle increased load, including caching strategies, load balancing, and database sharding.

`;
            let responseContent;
            if (config.apiProvider === "openai") {
                // OpenAI processing
                if (!this.openaiClient) {
                    return {
                        success: false,
                        error: "OpenAI API key not configured. Please check your settings."
                    };
                }
                // Send to OpenAI API
                const solutionResponse = await this.openaiClient.chat.completions.create({
                    model: config.solutionModel || "gpt-4o",
                    messages: [
                        { role: "system", content: "You are an expert coding interview assistant. Provide clear, optimal solutions with detailed explanations." },
                        { role: "user", content: promptText }
                    ],
                    max_tokens: 4000,
                    temperature: 0.2
                });
                responseContent = solutionResponse.choices[0].message.content;
            }
            else {
                // Gemini processing
                if (!this.geminiApiKey) {
                    return {
                        success: false,
                        error: "Gemini API key not configured. Please check your settings."
                    };
                }
                try {
                    // Create Gemini message structure
                    const geminiMessages = [
                        {
                            role: "user",
                            parts: [
                                {
                                    text: `You are an expert coding interview assistant. Provide a clear, optimal solution with detailed explanations for this problem:\n\n${promptText}`
                                }
                            ]
                        }
                    ];
                    // Make API request to Gemini
                    const response = await axios.default.post(`https://generativelanguage.googleapis.com/v1beta/models/${config.solutionModel || "gemini-2.0-flash"}:generateContent?key=${this.geminiApiKey}`, {
                        contents: geminiMessages,
                        generationConfig: {
                            temperature: 0.2,
                            maxOutputTokens: 4000
                        }
                    }, { signal });
                    const responseData = response.data;
                    if (!responseData.candidates || responseData.candidates.length === 0) {
                        throw new Error("Empty response from Gemini API");
                    }
                    responseContent = responseData.candidates[0].content.parts[0].text;
                }
                catch (error) {
                    console.error("Error using Gemini API for solution:", error);
                    return {
                        success: false,
                        error: "Failed to generate solution with Gemini API. Please check your API key or try again later."
                    };
                }
            }
            // Extract parts from the response
            const codeMatch = responseContent.match(/```(?:\w+)?\s*([\s\S]*?)```/);
            const code = codeMatch ? codeMatch[1].trim() : responseContent;
            // Extract thoughts, looking for bullet points or numbered lists
            const thoughtsRegex = /(?:Thoughts:|Key Insights:|Reasoning:|Approach:)([\s\S]*?)(?:Time complexity:|$)/i;
            const thoughtsMatch = responseContent.match(thoughtsRegex);
            let thoughts = [];
            if (thoughtsMatch && thoughtsMatch[1]) {
                // Extract bullet points or numbered items
                const bulletPoints = thoughtsMatch[1].match(/(?:^|\n)\s*(?:[-*•]|\d+\.)\s*(.*)/g);
                if (bulletPoints) {
                    thoughts = bulletPoints.map(point => point.replace(/^\s*(?:[-*•]|\d+\.)\s*/, '').trim()).filter(Boolean);
                }
                else {
                    // If no bullet points found, split by newlines and filter empty lines
                    thoughts = thoughtsMatch[1].split('\n')
                        .map(line => line.trim())
                        .filter(Boolean);
                }
            }
            // Extract complexity information
            // Extract time and space complexity from response
            const timeComplexityPattern = /Time complexity:?\s*O\([^)]+\)[^.]*.(?:[^.]*\.|$)/i;
            const spaceComplexityPattern = /Space complexity:?\s*O\([^)]+\)[^.]*.(?:[^.]*\.|$)/i;
            // Set default complexity explanations
            let timeComplexity = "O(n) - Assuming linear time complexity. Please see the solution explanation for more details.";
            let spaceComplexity = "O(n) - Assuming linear space complexity. Please see the solution explanation for more details.";
            // Extract time complexity from response
            const timeMatch = responseContent.match(timeComplexityPattern);
            if (timeMatch && timeMatch[0]) {
                timeComplexity = timeMatch[0].trim();
                // Remove the "Time complexity:" prefix if present
                timeComplexity = timeComplexity.replace(/^Time complexity:\s*/i, '');
            }
            // Extract space complexity from response
            const spaceMatch = responseContent.match(spaceComplexityPattern);
            if (spaceMatch && spaceMatch[0]) {
                spaceComplexity = spaceMatch[0].trim();
                // Remove the "Space complexity:" prefix if present
                spaceComplexity = spaceComplexity.replace(/^Space complexity:\s*/i, '');
            }
            const formattedResponse = {
                code: code,
                thoughts: thoughts.length > 0 ? thoughts : ["Solution approach based on efficiency and readability"],
                time_complexity: timeComplexity,
                space_complexity: spaceComplexity
            };
            return { success: true, data: formattedResponse };
        }
        catch (error) {
            if (axios.isCancel(error)) {
                return {
                    success: false,
                    error: "Processing was canceled by the user."
                };
            }
            if (error?.response?.status === 401) {
                return {
                    success: false,
                    error: "Invalid OpenAI API key. Please check your settings."
                };
            }
            else if (error?.response?.status === 429) {
                return {
                    success: false,
                    error: "OpenAI API rate limit exceeded or insufficient credits. Please try again later."
                };
            }
            console.error("Solution generation error:", error);
            return { success: false, error: error.message || "Failed to generate solution" };
        }
    }
    async processExtraScreenshotsHelper(screenshots, signal) {
        try {
            const problemInfo = this.deps.getProblemInfo();
            const language = await this.getLanguage();
            const config = ConfigHelper_1.configHelper.loadConfig();
            const mainWindow = this.deps.getMainWindow();
            if (!problemInfo) {
                throw new Error("No problem info available");
            }
            // Update progress status
            if (mainWindow) {
                mainWindow.webContents.send("processing-status", {
                    message: "Processing debug screenshots...",
                    progress: 30
                });
            }
            // Prepare the images for the API call
            const imageDataList = screenshots.map(screenshot => screenshot.data);
            let debugContent;
            if (config.apiProvider === "openai") {
                if (!this.openaiClient) {
                    return {
                        success: false,
                        error: "OpenAI API key not configured. Please check your settings."
                    };
                }
                const messages = [
                    {
                        role: "system",
                        content: `You are a coding interview assistant helping debug and improve solutions. Analyze these screenshots which include either error messages, incorrect outputs, follow-up questions or test cases, and provide detailed debugging help. If class structrue is followed then include unit tests as well

Your response MUST follow this exact structure with these section headers (use ### for headers):
### Key Points
- Summary bullet points of the changes made 

include code Implementation using traditional loop structures and variable assignments, avoiding single-line shortcuts , use proper markdown code blocks with language specification (e.g. \`\`\`java).`
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: `I'm solving this coding problem: "${problemInfo.problem_statement}" in ${language}. I need help with debugging or improving my solution. Here are screenshots of my code, the errors or test cases. Please provide a detailed analysis with:
1. Summary bullet points of the changes made 
2. Code implementation with proper markdown code blocks
`
                            },
                            ...imageDataList.map(data => ({
                                type: "image_url",
                                image_url: { url: `data:image/png;base64,${data}` }
                            }))
                        ]
                    }
                ];
                if (mainWindow) {
                    mainWindow.webContents.send("processing-status", {
                        message: "Analyzing code and generating debug feedback...",
                        progress: 60
                    });
                }
                const debugResponse = await this.openaiClient.chat.completions.create({
                    model: config.debuggingModel || "gpt-4o",
                    messages: messages,
                    max_tokens: 4000,
                    temperature: 0.2
                });
                debugContent = debugResponse.choices[0].message.content;
            }
            else {
                if (!this.geminiApiKey) {
                    return {
                        success: false,
                        error: "Gemini API key not configured. Please check your settings."
                    };
                }
                try {
                    const debugPrompt = `
You are a coding interview assistant helping debug and improve solutions. Analyze these screenshots which include either error messages, incorrect outputs, or test cases, and provide detailed debugging help.

I'm solving this coding problem: "${problemInfo.problem_statement}" in ${language}. I need help with debugging or improving my solution.

YOUR RESPONSE MUST FOLLOW THIS EXACT STRUCTURE WITH THESE SECTION HEADERS:
### Issues Identified
- List each issue as a bullet point with clear explanation

### Specific Improvements and Corrections
- List specific code changes needed as bullet points

### Optimizations
- List any performance optimizations if applicable

### Explanation of Changes Needed
Here provide a clear explanation of why the changes are needed

### Key Points
- Summary bullet points of the most important takeaways

If you include code examples, use proper markdown code blocks with language specification (e.g. \`\`\`java).
`;
                    const geminiMessages = [
                        {
                            role: "user",
                            parts: [
                                { text: debugPrompt },
                                ...imageDataList.map(data => ({
                                    inlineData: {
                                        mimeType: "image/png",
                                        data: data
                                    }
                                }))
                            ]
                        }
                    ];
                    if (mainWindow) {
                        mainWindow.webContents.send("processing-status", {
                            message: "Analyzing code and generating debug feedback with Gemini...",
                            progress: 60
                        });
                    }
                    const response = await axios.default.post(`https://generativelanguage.googleapis.com/v1beta/models/${config.debuggingModel || "gemini-2.0-flash"}:generateContent?key=${this.geminiApiKey}`, {
                        contents: geminiMessages,
                        generationConfig: {
                            temperature: 0.2,
                            maxOutputTokens: 4000
                        }
                    }, { signal });
                    const responseData = response.data;
                    if (!responseData.candidates || responseData.candidates.length === 0) {
                        throw new Error("Empty response from Gemini API");
                    }
                    debugContent = responseData.candidates[0].content.parts[0].text;
                }
                catch (error) {
                    console.error("Error using Gemini API for debugging:", error);
                    return {
                        success: false,
                        error: "Failed to process debug request with Gemini API. Please check your API key or try again later."
                    };
                }
            }
            if (mainWindow) {
                mainWindow.webContents.send("processing-status", {
                    message: "Debug analysis complete",
                    progress: 100
                });
            }
            let extractedCode = "// Debug mode - see analysis below";
            const codeMatch = debugContent.match(/```(?:[a-zA-Z]+)?([\s\S]*?)```/);
            if (codeMatch && codeMatch[1]) {
                extractedCode = codeMatch[1].trim();
            }
            let formattedDebugContent = debugContent;
            if (!debugContent.includes('# ') && !debugContent.includes('## ')) {
                formattedDebugContent = debugContent
                    .replace(/issues identified|problems found|bugs found/i, '## Issues Identified')
                    .replace(/code improvements|improvements|suggested changes/i, '## Code Improvements')
                    .replace(/optimizations|performance improvements/i, '## Optimizations')
                    .replace(/explanation|detailed analysis/i, '## Explanation');
            }
            const bulletPoints = formattedDebugContent.match(/(?:^|\n)[ ]*(?:[-*•]|\d+\.)[ ]+([^\n]+)/g);
            const thoughts = bulletPoints
                ? bulletPoints.map(point => point.replace(/^[ ]*(?:[-*•]|\d+\.)[ ]+/, '').trim()).slice(0, 5)
                : ["Debug analysis based on your screenshots"];
            const response = {
                code: extractedCode,
                debug_analysis: formattedDebugContent,
                thoughts: thoughts,
                time_complexity: "N/A - Debug mode",
                space_complexity: "N/A - Debug mode"
            };
            return { success: true, data: response };
        }
        catch (error) {
            console.error("Debug processing error:", error);
            return { success: false, error: error.message || "Failed to process debug request" };
        }
    }
    cancelOngoingRequests() {
        let wasCancelled = false;
        if (this.currentProcessingAbortController) {
            this.currentProcessingAbortController.abort();
            this.currentProcessingAbortController = null;
            wasCancelled = true;
        }
        if (this.currentExtraProcessingAbortController) {
            this.currentExtraProcessingAbortController.abort();
            this.currentExtraProcessingAbortController = null;
            wasCancelled = true;
        }
        this.deps.setHasDebugged(false);
        this.deps.setProblemInfo(null);
        const mainWindow = this.deps.getMainWindow();
        if (wasCancelled && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
        }
    }
}
exports.ProcessingHelper = ProcessingHelper;
