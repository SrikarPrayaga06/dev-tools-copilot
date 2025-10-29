"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configHelper = exports.ConfigHelper = void 0;
// ConfigHelper.ts
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const electron_1 = require("electron");
const events_1 = require("events");
const openai_1 = require("openai");
class ConfigHelper extends events_1.EventEmitter {
    constructor() {
        super();
        this.defaultConfig = {
            apiKey: "",
            apiProvider: "gemini", // Default to Gemini
            extractionModel: "gemini-2.0-flash", // Default to Flash for faster responses
            solutionModel: "gemini-2.0-flash",
            debuggingModel: "gemini-2.0-flash",
            language: "python",
            opacity: 1.0
        };
        // Use the app's user data directory to store the config
        try {
            this.configPath = node_path_1.default.join(electron_1.app.getPath('userData'), 'config.json');
            console.log('Config path:', this.configPath);
        }
        catch (err) {
            console.warn('Could not access user data path, using fallback');
            this.configPath = node_path_1.default.join(process.cwd(), 'config.json');
        }
        // Ensure the initial config file exists
        this.ensureConfigExists();
    }
    /**
     * Ensure config file exists
     */
    ensureConfigExists() {
        try {
            if (!node_fs_1.default.existsSync(this.configPath)) {
                this.saveConfig(this.defaultConfig);
            }
        }
        catch (err) {
            console.error("Error ensuring config exists:", err);
        }
    }
    /**
     * Validate and sanitize model selection to ensure only allowed models are used
     */
    sanitizeModelSelection(model, provider) {
        if (provider === "openai") {
            // Only allow gpt-4o and gpt-4o-mini for OpenAI
            const allowedModels = ['gpt-4o', 'gpt-4o-mini'];
            if (!allowedModels.includes(model)) {
                console.warn(`Invalid OpenAI model specified: ${model}. Using default model: gpt-4o`);
                return 'gpt-4o';
            }
            return model;
        }
        else {
            // Only allow gemini-1.5-pro and gemini-2.0-flash for Gemini
            const allowedModels = ['gemini-1.5-pro', 'gemini-2.0-flash'];
            if (!allowedModels.includes(model)) {
                console.warn(`Invalid Gemini model specified: ${model}. Using default model: gemini-2.0-flash`);
                return 'gemini-2.0-flash'; // Changed default to flash
            }
            return model;
        }
    }
    loadConfig() {
        try {
            if (node_fs_1.default.existsSync(this.configPath)) {
                const configData = node_fs_1.default.readFileSync(this.configPath, 'utf8');
                const config = JSON.parse(configData);
                // Ensure apiProvider is a valid value
                if (config.apiProvider !== "openai" && config.apiProvider !== "gemini") {
                    config.apiProvider = "gemini"; // Default to Gemini if invalid
                }
                // Sanitize model selections to ensure only allowed models are used
                if (config.extractionModel) {
                    config.extractionModel = this.sanitizeModelSelection(config.extractionModel, config.apiProvider);
                }
                if (config.solutionModel) {
                    config.solutionModel = this.sanitizeModelSelection(config.solutionModel, config.apiProvider);
                }
                if (config.debuggingModel) {
                    config.debuggingModel = this.sanitizeModelSelection(config.debuggingModel, config.apiProvider);
                }
                return {
                    ...this.defaultConfig,
                    ...config
                };
            }
            // If no config exists, create a default one
            this.saveConfig(this.defaultConfig);
            return this.defaultConfig;
        }
        catch (err) {
            console.error("Error loading config:", err);
            return this.defaultConfig;
        }
    }
    /**
     * Save configuration to disk
     */
    saveConfig(config) {
        try {
            // Ensure the directory exists
            const configDir = node_path_1.default.dirname(this.configPath);
            if (!node_fs_1.default.existsSync(configDir)) {
                node_fs_1.default.mkdirSync(configDir, { recursive: true });
            }
            // Write the config file
            node_fs_1.default.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
        }
        catch (err) {
            console.error("Error saving config:", err);
        }
    }
    /**
     * Update specific configuration values
     */
    updateConfig(updates) {
        try {
            const currentConfig = this.loadConfig();
            let provider = updates.apiProvider || currentConfig.apiProvider;
            // Auto-detect provider based on API key format if a new key is provided
            if (updates.apiKey && !updates.apiProvider) {
                // If API key starts with "sk-", it's likely an OpenAI key
                if (updates.apiKey.trim().startsWith('sk-')) {
                    provider = "openai";
                    console.log("Auto-detected OpenAI API key format");
                }
                else {
                    provider = "gemini";
                    console.log("Using Gemini API key format (default)");
                }
                // Update the provider in the updates object
                updates.apiProvider = provider;
            }
            // If provider is changing, reset models to the default for that provider
            if (updates.apiProvider && updates.apiProvider !== currentConfig.apiProvider) {
                if (updates.apiProvider === "openai") {
                    updates.extractionModel = "gpt-4o";
                    updates.solutionModel = "gpt-4o";
                    updates.debuggingModel = "gpt-4o";
                }
                else {
                    updates.extractionModel = "gemini-2.0-flash";
                    updates.solutionModel = "gemini-2.0-flash";
                    updates.debuggingModel = "gemini-2.0-flash";
                }
            }
            // Sanitize model selections in the updates
            if (updates.extractionModel) {
                updates.extractionModel = this.sanitizeModelSelection(updates.extractionModel, provider);
            }
            if (updates.solutionModel) {
                updates.solutionModel = this.sanitizeModelSelection(updates.solutionModel, provider);
            }
            if (updates.debuggingModel) {
                updates.debuggingModel = this.sanitizeModelSelection(updates.debuggingModel, provider);
            }
            const newConfig = { ...currentConfig, ...updates };
            this.saveConfig(newConfig);
            // Only emit update event for changes other than opacity
            // This prevents re-initializing the AI client when only opacity changes
            if (updates.apiKey !== undefined || updates.apiProvider !== undefined ||
                updates.extractionModel !== undefined || updates.solutionModel !== undefined ||
                updates.debuggingModel !== undefined || updates.language !== undefined) {
                this.emit('config-updated', newConfig);
            }
            return newConfig;
        }
        catch (error) {
            console.error('Error updating config:', error);
            return this.defaultConfig;
        }
    }
    /**
     * Check if the API key is configured
     */
    hasApiKey() {
        const config = this.loadConfig();
        return !!config.apiKey && config.apiKey.trim().length > 0;
    }
    /**
     * Validate the API key format
     */
    isValidApiKeyFormat(apiKey, provider) {
        // If provider is not specified, attempt to auto-detect
        if (!provider) {
            if (apiKey.trim().startsWith('sk-')) {
                provider = "openai";
            }
            else {
                provider = "gemini";
            }
        }
        if (provider === "openai") {
            // Basic format validation for OpenAI API keys
            return /^sk-[a-zA-Z0-9]{32,}$/.test(apiKey.trim());
        }
        else if (provider === "gemini") {
            // Basic format validation for Gemini API keys (usually alphanumeric with no specific prefix)
            return apiKey.trim().length >= 10; // Assuming Gemini keys are at least 10 chars
        }
        return false;
    }
    /**
     * Get the stored opacity value
     */
    getOpacity() {
        const config = this.loadConfig();
        return config.opacity !== undefined ? config.opacity : 1.0;
    }
    /**
     * Set the window opacity value
     */
    setOpacity(opacity) {
        // Ensure opacity is between 0.1 and 1.0
        const validOpacity = Math.min(1.0, Math.max(0.1, opacity));
        this.updateConfig({ opacity: validOpacity });
    }
    /**
     * Get the preferred programming language
     */
    getLanguage() {
        const config = this.loadConfig();
        return config.language || "python";
    }
    /**
     * Set the preferred programming language
     */
    setLanguage(language) {
        this.updateConfig({ language });
    }
    /**
     * Test API key with the selected provider
     */
    async testApiKey(apiKey, provider) {
        // Auto-detect provider based on key format if not specified
        if (!provider) {
            if (apiKey.trim().startsWith('sk-')) {
                provider = "openai";
                console.log("Auto-detected OpenAI API key format for testing");
            }
            else {
                provider = "gemini";
                console.log("Using Gemini API key format for testing (default)");
            }
        }
        if (provider === "openai") {
            return this.testOpenAIKey(apiKey);
        }
        else if (provider === "gemini") {
            return this.testGeminiKey(apiKey);
        }
        return { valid: false, error: "Unknown API provider" };
    }
    /**
     * Test OpenAI API key
     */
    async testOpenAIKey(apiKey) {
        try {
            const openai = new openai_1.OpenAI({ apiKey });
            // Make a simple API call to test the key
            await openai.models.list();
            return { valid: true };
        }
        catch (error) {
            console.error('OpenAI API key test failed:', error);
            // Determine the specific error type for better error messages
            let errorMessage = 'Unknown error validating OpenAI API key';
            if (error.status === 401) {
                errorMessage = 'Invalid API key. Please check your OpenAI key and try again.';
            }
            else if (error.status === 429) {
                errorMessage = 'Rate limit exceeded. Your OpenAI API key has reached its request limit or has insufficient quota.';
            }
            else if (error.status === 500) {
                errorMessage = 'OpenAI server error. Please try again later.';
            }
            else if (error.message) {
                errorMessage = `Error: ${error.message}`;
            }
            return { valid: false, error: errorMessage };
        }
    }
    /**
     * Test Gemini API key
     * Note: This is a simplified implementation since we don't have the actual Gemini client
     */
    async testGeminiKey(apiKey) {
        try {
            // For now, we'll just do a basic check to ensure the key exists and has valid format
            // In production, you would connect to the Gemini API and validate the key
            if (apiKey && apiKey.trim().length >= 20) {
                // Here you would actually validate the key with a Gemini API call
                return { valid: true };
            }
            return { valid: false, error: 'Invalid Gemini API key format.' };
        }
        catch (error) {
            console.error('Gemini API key test failed:', error);
            let errorMessage = 'Unknown error validating Gemini API key';
            if (error.message) {
                errorMessage = `Error: ${error.message}`;
            }
            return { valid: false, error: errorMessage };
        }
    }
}
exports.ConfigHelper = ConfigHelper;
// Export a singleton instance
exports.configHelper = new ConfigHelper();
