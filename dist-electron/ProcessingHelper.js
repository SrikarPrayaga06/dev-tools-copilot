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
                        content: "Extract problem from screenshot. Return JSON only: {problem_statement, constraints, example_input, example_output, functional_requirements}. For coding problems, functional_requirements should be null. For system design, include array of key requirements."
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: `Language: ${language}. Extract problem as JSON. If this is a system design problem, include functional_requirements as an array.`
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
                    if (!responseText) {
                        throw new Error("Empty response from API");
                    }
                    // Handle when OpenAI might wrap the JSON in markdown code blocks
                    const jsonText = responseText.replace(/```json|```/g, '').trim();
                    problemInfo = JSON.parse(jsonText);
                }
                catch (error) {
                    console.error("Error parsing OpenAI response:", error);
                    // Don't expose technical error details to UI
                    return {
                        success: false,
                        error: "Could not extract problem information from screenshots. Please ensure the screenshot clearly shows the problem statement."
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
                                    text: `Language: ${language}. Extract problem from screenshots as JSON: {problem_statement, constraints, example_input, example_output, functional_requirements}. For coding problems, functional_requirements should be null. For system design, include array of key requirements.`
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
                    if (!responseText) {
                        throw new Error("Empty response from Gemini API");
                    }
                    // Handle when Gemini might wrap the JSON in markdown code blocks
                    const jsonText = responseText.replace(/```json|```/g, '').trim();
                    try {
                        problemInfo = JSON.parse(jsonText);
                    }
                    catch (parseError) {
                        console.error("JSON parse error:", parseError);
                        throw new Error("Could not parse problem information from API response");
                    }
                }
                catch (error) {
                    console.error("Error using Gemini API:", error);
                    // Don't expose technical error details to UI
                    return {
                        success: false,
                        error: "Could not extract problem information from screenshots. Please ensure the screenshot clearly shows the problem statement."
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
            const functionalReqs = problemInfo.functional_requirements && Array.isArray(problemInfo.functional_requirements) && problemInfo.functional_requirements.length > 0
                ? `\nFunctional Requirements:\n${problemInfo.functional_requirements.map((req, i) => `${i + 1}. ${req}`).join('\n')}`
                : '';
            const promptText = `Problem: ${problemInfo.problem_statement}
    Constraints: ${problemInfo.constraints || "None"}
    Input: ${problemInfo.example_input || "N/A"}
    Output: ${problemInfo.example_output || "N/A"}${functionalReqs}
    Language: ${language}

    Determine if this is a Coding Problem or a System Design Problem.
    Start your response with "TYPE: CODING" or "TYPE: SYSTEM DESIGN".

    If CODING PROBLEM:
    Provide:
    1. Code (clean ${language} implementation with inline comments explaining key steps and logic)
       - IMPORTANT: Provide the MOST OPTIMIZED solution as the main implementation
       - After the main solution, add 3-5 common interview follow-up variations as commented code sections
       - Follow-ups should modify constraints (e.g., Input assumptions (sorted/unsorted, duplicates, negatives),Output requirements (indices vs values, one vs all solutions), Size/scale constraints,Space vs time trade-offs)
       - For each follow-up: add header comment with question, complexity analysis, and ACTUAL WORKING CODE (full function or modified lines)
    2. My Thoughts (bullet points):
       - Summary: First, restate the problem in my own words
       - What the question is asking for
       - High-level approach/strategy I'll use
       - Key steps: Key steps to implement the solution as if you explain to interviewer before coding out solution
       - edge cases: Any edge cases or special considerations
    3. Time complexity O(X) + 2-sentence explanation
    4. Space complexity O(X) + 2-sentence explanation

    If SYSTEM DESIGN PROBLEM:
    Provide a comprehensive technical design document in Markdown format:
    1. Functional/Non-functional Requirements Summary: Restate and clarify the key functional/non functional requirements from the problem.
    2. Detailed Architecture Diagram built to scale for the  Functional/Non-functional Requirements as a Mermaid flowchart with comprehensive annotations and problem-specific service names. CRITICAL requirements:
       - Start with: graph TB (top-to-bottom) or graph LR (left-to-right)
       - Use simple alphanumeric node IDs (no spaces, no special chars like underscores for node IDs)
       - Format: NodeID[Display Label] -->|annotation| OtherNodeID[Other Label]
       - IMPORTANT: Use domain-specific service names based on the problem (e.g., for Twitter: TweetService, TimelineService, UserService; for Uber: RideMatchingService, LocationService, PaymentService; NOT generic names like API1, API2, Service1)
       - IMPORTANT: Specify database/storage types in labels (e.g., PostgreSQL, MySQL, MongoDB, Cassandra, Redis, S3, DynamoDB)
       - Include annotations on arrows showing: protocols (HTTP/gRPC/WebSocket), data formats (JSON/Protobuf), message types, API endpoints
       - Show scalability elements: load balancers, caching layers, message queues, CDNs
       - Use ONLY these node shapes: 
         * [] for regular services/components
         * [()] for databases/storage systems
         * {{}} for message queues
       - NO semicolons, NO pipes in labels, NO special characters in node IDs, NO slashes in shape notation
       - Example with problem-specific names and storage types (Twitter-like system):
         Client[Mobile App] -->|HTTPS/POST /tweet| LB[Load Balancer]
         LB -->|Route| TweetService[Tweet Service]
         TweetService -->|Write| TweetDB[(PostgreSQL - Tweets)]
         TweetService -->|Cache| UserCache[Redis - User Cache]
         TweetService -->|Upload Media| BlobStore[(S3 - Media Storage)]
         TweetService -->|Publish| FanoutQueue{{Kafka - Fanout Queue}}
         FanoutQueue -->|Consume| TimelineService[Timeline Service]
         TimelineService -->|Write| TimelineDB[(Cassandra - Timelines)]
         CDN[CloudFront CDN] -->|Serve Media| Client
    3. Define core entities : List key data objects (e.g., User, Tweet, Follow) that represent system concepts and evolve as the design progresses.
    4. Explain data flow : Outline the main sequence of actions or processing steps the system performs from input to output, using a simple list if your system involves multi-stage processing or data transformation.
    5. Design the API : Establish main endpoints or interfaces based on functional requirements, typically using REST. Keep security strong by authenticating requests properly.
    6. DB Design : For each database/storage system identified in architecture, specify:
       - Storage type (SQL: PostgreSQL/MySQL, NoSQL: MongoDB/Cassandra/DynamoDB, Cache: Redis/Memcached, Blob: S3/Azure Blob)
       - Tables/Collections with attributes, primary keys, foreign keys, and indexes
       - Justification for the storage choice based on data access patterns
    7. Run deep dives: Optimize for non-functional requirements, address bottlenecks, be specific about shard keys and scale the design as needed (e.g., caching strategies with TTLs, database sharding with shard keys, replication strategies, fanout patterns, rate limiting, CDN usage, etc).
    8. Q/a :Think of common deep dive questions and answer in q/a format.
    DO NOT include "My Thoughts", "Time complexity", or "Space complexity" sections for system design.`;
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
                        { role: "system", content: "Expert coding assistant. Code naturally as if live-coding without AI:\n- Explicit for/while loops (no map/filter/reduce)\n- No one-liners or shortcuts\n- Full if-else (avoid ternary)\n- No unnecessary imports\n- Manual iteration (no enumerate/zip/comprehensions)\n- Verbose, step-by-step\n- Clear variable names" },
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
                                    text: `Code naturally as if live-coding without AI: explicit for/while loops (no map/filter/reduce), no one-liners, full if-else, no unnecessary imports, manual iteration (no enumerate/zip/comprehensions), verbose step-by-step.\n\n${promptText}`
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
            // Check for response type
            const isSystemDesign = responseContent.includes("TYPE: SYSTEM DESIGN");
            let code, thoughts, timeComplexity, spaceComplexity, followUpModifications;
            if (isSystemDesign) {
                // For system design, the "code" is the entire markdown response minus the type header
                code = responseContent.replace(/TYPE: (SYSTEM DESIGN|CODING)/i, "").trim();
                thoughts = [];
                timeComplexity = "N/A - System Design";
                spaceComplexity = "N/A - System Design";
                followUpModifications = '';
            }
            else {
                // Remove TYPE: CODING if present
                const cleanContent = responseContent.replace(/TYPE: (SYSTEM DESIGN|CODING)/i, "").trim();
                // Extract parts from the response
                const codeMatch = cleanContent.match(/```(?:\w+)?\s*([\s\S]*?)```/);
                if (codeMatch) {
                    // Extract the language from the code block
                    const langMatch = cleanContent.match(/```(\w+)/);
                    const lang = langMatch ? langMatch[1] : language;
                    // Wrap the code in markdown code blocks for syntax highlighting
                    code = `\`\`\`${lang}\n${codeMatch[1].trim()}\n\`\`\``;
                }
                else {
                    // If no code block found, wrap the entire content as code
                    code = `\`\`\`${language}\n${cleanContent}\n\`\`\``;
                }
                // Extract thoughts, looking for "My Thoughts" section with bullet points
                const thoughtsRegex = /(?:My Thoughts|Thoughts:|Key Insights:|Reasoning:|Approach:)[:\s]*([\s\S]*?)(?:(?:\n\s*\d+\.)|Time complexity:|Space complexity:|Common Follow-up|$)/i;
                const thoughtsMatch = cleanContent.match(thoughtsRegex);
                thoughts = [];
                if (thoughtsMatch && thoughtsMatch[1]) {
                    // Extract bullet points or numbered items - more aggressive matching
                    const bulletPoints = thoughtsMatch[1].match(/(?:^|\n)\s*(?:[-*•]|\d+\.|\-\s)\s*(.+?)(?=\n\s*(?:[-*•]|\d+\.|\-\s)|$)/gs);
                    if (bulletPoints) {
                        thoughts = bulletPoints.map(point => {
                            // Clean up the bullet point
                            let cleaned = point.replace(/^\s*(?:[-*•]|\d+\.|\-\s)\s*/, '').trim();
                            // Remove newlines within a bullet point and replace with spaces
                            cleaned = cleaned.replace(/\n+/g, ' ').trim();
                            return cleaned;
                        }).filter(Boolean);
                    }
                    // If still no bullet points found, try splitting by newlines
                    if (thoughts.length === 0) {
                        thoughts = thoughtsMatch[1].split('\n')
                            .map(line => line.trim())
                            .filter(line => line.length > 0 && !line.match(/^(Time|Space) complexity:/i));
                    }
                }
                // Extract complexity information
                // Extract time and space complexity from response with improved regex to capture full explanations
                // This pattern captures everything from "O(...)" until the next section or end of content
                const timeComplexityPattern = /(?:Time\s*complexity|Time\s*Complexity)[\s\W]*(O\s*\([^)]+\)[^\n]*(?:\n(?!(?:Space|Time|Common Follow-up|\d+\.|###|##|\*\*)).*)*)/i;
                const spaceComplexityPattern = /(?:Space\s*complexity|Space\s*Complexity)[\s\W]*(O\s*\([^)]+\)[^\n]*(?:\n(?!(?:Time|Space|Common Follow-up|\d+\.|###|##|\*\*)).*)*)/i;
                // Set default complexity explanations
                timeComplexity = "O(n) - Assuming linear time complexity. Please see the solution explanation for more details.";
                spaceComplexity = "O(n) - Assuming linear space complexity. Please see the solution explanation for more details.";
                // Extract time complexity from response
                const timeMatch = cleanContent.match(timeComplexityPattern);
                if (timeMatch && timeMatch[1]) {
                    // Clean up the extracted complexity, removing extra whitespace and newlines
                    timeComplexity = timeMatch[1].trim().replace(/\s+/g, ' ');
                }
                // Extract space complexity from response
                const spaceMatch = cleanContent.match(spaceComplexityPattern);
                if (spaceMatch && spaceMatch[1]) {
                    // Clean up the extracted complexity, removing extra whitespace and newlines
                    spaceComplexity = spaceMatch[1].trim().replace(/\s+/g, ' ');
                }
                // Extract follow-up modifications section from the full response content (not cleanContent which has code stripped)
                const followUpPattern = /(?:Common Follow-up Modifications|Follow-up Modifications)[:\s]*\n*([\s\S]*?)(?:$)/i;
                const followUpMatch = responseContent.match(followUpPattern);
                followUpModifications = '';
                if (followUpMatch && followUpMatch[1]) {
                    followUpModifications = followUpMatch[1].trim();
                }
            }
            const formattedResponse = {
                code: code,
                thoughts: isSystemDesign ? [] : (thoughts && thoughts.length > 0 ? thoughts : ["Solution approach based on efficiency and readability"]),
                time_complexity: timeComplexity,
                space_complexity: spaceComplexity,
                follow_up_modifications: isSystemDesign ? '' : followUpModifications
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
                        content: `Debug assistant. Analyze screenshots (errors/outputs/tests). Structure:
### Key Points
- Summary bullets

Code in markdown blocks. Style: explicit loops (no map/filter), no one-liners, full if-else, no unnecessary imports, manual iteration (no enumerate/comprehensions), verbose.`
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: `Problem: "${problemInfo.problem_statement}" (${language}). Debug/improve with: 1) Summary bullets 2) Code in markdown`
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
                    const debugPrompt = `Problem: "${problemInfo.problem_statement}" (${language}). Analyze screenshots for debugging.

Structure:
### Issues Identified
### Specific Improvements and Corrections
### Optimizations
### Explanation of Changes Needed
### Key Points

Code in markdown (e.g. \`\`\`java). Style: explicit loops (no map/filter), no one-liners, full if-else, no unnecessary imports, manual iteration (no enumerate/comprehensions), verbose.`;
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
