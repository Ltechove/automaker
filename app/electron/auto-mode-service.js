const { query, AbortError } = require("@anthropic-ai/claude-agent-sdk");
const path = require("path");
const fs = require("fs/promises");

/**
 * Auto Mode Service - Autonomous feature implementation
 * Automatically picks and implements features from the kanban board
 */
class AutoModeService {
  constructor() {
    // Track multiple concurrent feature executions
    this.runningFeatures = new Map(); // featureId -> { abortController, query, projectPath, sendToRenderer }
    this.autoLoopRunning = false; // Separate flag for the auto loop
    this.autoLoopAbortController = null;
  }

  /**
   * Start auto mode - continuously implement features
   */
  async start({ projectPath, sendToRenderer }) {
    if (this.autoLoopRunning) {
      throw new Error("Auto mode loop is already running");
    }

    this.autoLoopRunning = true;

    console.log("[AutoMode] Starting auto mode for project:", projectPath);

    // Run the autonomous loop
    this.runLoop(projectPath, sendToRenderer).catch((error) => {
      console.error("[AutoMode] Loop error:", error);
      this.stop();
    });

    return { success: true };
  }

  /**
   * Stop auto mode - stops the auto loop and all running features
   */
  async stop() {
    console.log("[AutoMode] Stopping auto mode");

    this.autoLoopRunning = false;

    // Abort auto loop if running
    if (this.autoLoopAbortController) {
      this.autoLoopAbortController.abort();
      this.autoLoopAbortController = null;
    }

    // Abort all running features
    for (const [featureId, execution] of this.runningFeatures.entries()) {
      console.log(`[AutoMode] Aborting feature: ${featureId}`);
      if (execution.abortController) {
        execution.abortController.abort();
      }
    }

    // Clear all running features
    this.runningFeatures.clear();

    return { success: true };
  }

  /**
   * Get status of auto mode
   */
  getStatus() {
    return {
      autoLoopRunning: this.autoLoopRunning,
      runningFeatures: Array.from(this.runningFeatures.keys()),
      runningCount: this.runningFeatures.size,
    };
  }

  /**
   * Run a specific feature by ID
   */
  async runFeature({ projectPath, featureId, sendToRenderer }) {
    // Check if this specific feature is already running
    if (this.runningFeatures.has(featureId)) {
      throw new Error(`Feature ${featureId} is already running`);
    }

    console.log(`[AutoMode] Running specific feature: ${featureId}`);

    // Register this feature as running
    this.runningFeatures.set(featureId, {
      abortController: null,
      query: null,
      projectPath,
      sendToRenderer,
    });

    try {
      // Load features
      const features = await this.loadFeatures(projectPath);
      const feature = features.find((f) => f.id === featureId);

      if (!feature) {
        throw new Error(`Feature ${featureId} not found`);
      }

      console.log(`[AutoMode] Running feature: ${feature.description}`);

      // Update feature status to in_progress
      await this.updateFeatureStatus(featureId, "in_progress", projectPath);

      sendToRenderer({
        type: "auto_mode_feature_start",
        featureId: feature.id,
        feature: feature,
      });

      // Implement the feature
      const result = await this.implementFeature(feature, projectPath, sendToRenderer);

      // Update feature status based on result
      const newStatus = result.passes ? "verified" : "backlog";
      await this.updateFeatureStatus(feature.id, newStatus, projectPath);

      sendToRenderer({
        type: "auto_mode_feature_complete",
        featureId: feature.id,
        passes: result.passes,
        message: result.message,
      });

      return { success: true, passes: result.passes };
    } catch (error) {
      console.error("[AutoMode] Error running feature:", error);
      sendToRenderer({
        type: "auto_mode_error",
        error: error.message,
        featureId: featureId,
      });
      throw error;
    } finally {
      // Clean up this feature's execution
      this.runningFeatures.delete(featureId);
    }
  }

  /**
   * Verify a specific feature by running its tests
   */
  async verifyFeature({ projectPath, featureId, sendToRenderer }) {
    console.log(`[AutoMode] verifyFeature called with:`, {
      projectPath,
      featureId,
    });

    // Check if this specific feature is already running
    if (this.runningFeatures.has(featureId)) {
      throw new Error(`Feature ${featureId} is already running`);
    }

    console.log(`[AutoMode] Verifying feature: ${featureId}`);

    // Register this feature as running
    this.runningFeatures.set(featureId, {
      abortController: null,
      query: null,
      projectPath,
      sendToRenderer,
    });

    try {
      // Load features
      const features = await this.loadFeatures(projectPath);
      const feature = features.find((f) => f.id === featureId);

      if (!feature) {
        throw new Error(`Feature ${featureId} not found`);
      }

      console.log(`[AutoMode] Verifying feature: ${feature.description}`);

      sendToRenderer({
        type: "auto_mode_feature_start",
        featureId: feature.id,
        feature: feature,
      });

      // Verify the feature by running tests
      const result = await this.verifyFeatureTests(feature, projectPath, sendToRenderer);

      // Update feature status based on result
      const newStatus = result.passes ? "verified" : "in_progress";
      await this.updateFeatureStatus(featureId, newStatus, projectPath);

      sendToRenderer({
        type: "auto_mode_feature_complete",
        featureId: feature.id,
        passes: result.passes,
        message: result.message,
      });

      return { success: true, passes: result.passes };
    } catch (error) {
      console.error("[AutoMode] Error verifying feature:", error);
      sendToRenderer({
        type: "auto_mode_error",
        error: error.message,
        featureId: featureId,
      });
      throw error;
    } finally {
      // Clean up this feature's execution
      this.runningFeatures.delete(featureId);
    }
  }

  /**
   * Resume a feature that has previous context - loads existing context and continues implementation
   */
  async resumeFeature({ projectPath, featureId, sendToRenderer }) {
    console.log(`[AutoMode] resumeFeature called with:`, {
      projectPath,
      featureId,
    });

    // Check if this specific feature is already running
    if (this.runningFeatures.has(featureId)) {
      throw new Error(`Feature ${featureId} is already running`);
    }

    console.log(`[AutoMode] Resuming feature: ${featureId}`);

    // Register this feature as running
    this.runningFeatures.set(featureId, {
      abortController: null,
      query: null,
      projectPath,
      sendToRenderer,
    });

    try {
      // Load features
      const features = await this.loadFeatures(projectPath);
      const feature = features.find((f) => f.id === featureId);

      if (!feature) {
        throw new Error(`Feature ${featureId} not found`);
      }

      console.log(`[AutoMode] Resuming feature: ${feature.description}`);

      sendToRenderer({
        type: "auto_mode_feature_start",
        featureId: feature.id,
        feature: feature,
      });

      // Read existing context
      const previousContext = await this.readContextFile(projectPath, featureId);

      // Resume implementation with context
      const result = await this.resumeFeatureWithContext(feature, projectPath, sendToRenderer, previousContext);

      // If the agent ends early without finishing, automatically re-run
      let attempts = 0;
      const maxAttempts = 3;
      let finalResult = result;

      while (!finalResult.passes && attempts < maxAttempts) {
        // Check if feature is still in progress (not verified)
        const updatedFeatures = await this.loadFeatures(projectPath);
        const updatedFeature = updatedFeatures.find((f) => f.id === featureId);

        if (updatedFeature && updatedFeature.status === "in_progress") {
          attempts++;
          console.log(`[AutoMode] Feature ended early, auto-retrying (attempt ${attempts}/${maxAttempts})...`);

          // Update context file with retry message
          await this.writeToContextFile(projectPath, featureId,
            `\n\n🔄 Auto-retry #${attempts} - Continuing implementation...\n\n`);

          sendToRenderer({
            type: "auto_mode_progress",
            featureId: feature.id,
            content: `\n🔄 Auto-retry #${attempts} - Agent ended early, continuing...\n`,
          });

          // Read updated context
          const retryContext = await this.readContextFile(projectPath, featureId);

          // Resume again with full context
          finalResult = await this.resumeFeatureWithContext(feature, projectPath, sendToRenderer, retryContext);
        } else {
          break;
        }
      }

      // Update feature status based on final result
      const newStatus = finalResult.passes ? "verified" : "in_progress";
      await this.updateFeatureStatus(featureId, newStatus, projectPath);

      sendToRenderer({
        type: "auto_mode_feature_complete",
        featureId: feature.id,
        passes: finalResult.passes,
        message: finalResult.message,
      });

      return { success: true, passes: finalResult.passes };
    } catch (error) {
      console.error("[AutoMode] Error resuming feature:", error);
      sendToRenderer({
        type: "auto_mode_error",
        error: error.message,
        featureId: featureId,
      });
      throw error;
    } finally {
      // Clean up this feature's execution
      this.runningFeatures.delete(featureId);
    }
  }

  /**
   * Read context file for a feature
   */
  async readContextFile(projectPath, featureId) {
    try {
      const contextPath = path.join(projectPath, ".automaker", "agents-context", `${featureId}.md`);
      const content = await fs.readFile(contextPath, "utf-8");
      return content;
    } catch (error) {
      console.log(`[AutoMode] No context file found for ${featureId}`);
      return null;
    }
  }

  /**
   * Resume feature implementation with previous context
   */
  async resumeFeatureWithContext(feature, projectPath, sendToRenderer, previousContext) {
    console.log(`[AutoMode] Resuming with context for: ${feature.description}`);

    // Get the execution context for this feature
    const execution = this.runningFeatures.get(feature.id);
    if (!execution) {
      throw new Error(`Feature ${feature.id} not registered in runningFeatures`);
    }

    try {
      const resumeMessage = `\n🔄 Resuming implementation for: ${feature.description}\n`;
      await this.writeToContextFile(projectPath, feature.id, resumeMessage);

      sendToRenderer({
        type: "auto_mode_phase",
        featureId: feature.id,
        phase: "action",
        message: `Resuming implementation for: ${feature.description}`,
      });

      const abortController = new AbortController();
      execution.abortController = abortController;

      const options = {
        model: "claude-opus-4-5-20251101",
        systemPrompt: this.getVerificationPrompt(),
        maxTurns: 1000,
        cwd: projectPath,
        allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "WebSearch", "WebFetch"],
        permissionMode: "acceptEdits",
        sandbox: {
          enabled: true,
          autoAllowBashIfSandboxed: true,
        },
        abortController: abortController,
      };

      // Build prompt with previous context
      const prompt = this.buildResumePrompt(feature, previousContext);

      const currentQuery = query({ prompt, options });
      execution.query = currentQuery;

      let responseText = "";
      for await (const msg of currentQuery) {
        // Check if this specific feature was aborted
        if (!this.runningFeatures.has(feature.id)) break;

        if (msg.type === "assistant" && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === "text") {
              responseText += block.text;

              await this.writeToContextFile(projectPath, feature.id, block.text);

              sendToRenderer({
                type: "auto_mode_progress",
                featureId: feature.id,
                content: block.text,
              });
            } else if (block.type === "tool_use") {
              const toolMsg = `\n🔧 Tool: ${block.name}\n`;
              await this.writeToContextFile(projectPath, feature.id, toolMsg);

              sendToRenderer({
                type: "auto_mode_tool",
                featureId: feature.id,
                tool: block.name,
                input: block.input,
              });
            }
          }
        }
      }

      execution.query = null;
      execution.abortController = null;

      // Check if feature was marked as verified
      const updatedFeatures = await this.loadFeatures(projectPath);
      const updatedFeature = updatedFeatures.find((f) => f.id === feature.id);
      const passes = updatedFeature?.status === "verified";

      const finalMsg = passes
        ? "✓ Feature successfully verified and completed\n"
        : "⚠ Feature still in progress - may need additional work\n";

      await this.writeToContextFile(projectPath, feature.id, finalMsg);

      sendToRenderer({
        type: "auto_mode_progress",
        featureId: feature.id,
        content: finalMsg,
      });

      return {
        passes,
        message: responseText.substring(0, 500),
      };
    } catch (error) {
      if (error instanceof AbortError || error?.name === "AbortError") {
        console.log("[AutoMode] Resume aborted");
        if (execution) {
          execution.abortController = null;
          execution.query = null;
        }
        return {
          passes: false,
          message: "Resume aborted",
        };
      }

      console.error("[AutoMode] Error resuming feature:", error);
      if (execution) {
        execution.abortController = null;
        execution.query = null;
      }
      throw error;
    }
  }

  /**
   * Build prompt for resuming feature with previous context
   */
  buildResumePrompt(feature, previousContext) {
    return `You are resuming work on a feature implementation that was previously started.

**Current Feature:**

Category: ${feature.category}
Description: ${feature.description}

**Steps to Complete:**
${feature.steps.map((step, i) => `${i + 1}. ${step}`).join("\n")}

**Previous Work Context:**

${previousContext || "No previous context available - this is a fresh start."}

**Your Task:**

Continue where you left off and complete the feature implementation:

1. Review the previous work context above to understand what has been done
2. Continue implementing the feature according to the description and steps
3. Write Playwright tests to verify the feature works correctly (if not already done)
4. Run the tests and ensure they pass
5. **DELETE the test file(s) you created** - tests are only for immediate verification
6. Update .automaker/feature_list.json to mark this feature as "status": "verified"
7. Commit your changes with git

**Important Guidelines:**

- Review what was already done in the previous context
- Don't redo work that's already complete - continue from where it left off
- Focus on completing any remaining tasks
- Write comprehensive Playwright tests if not already done
- Ensure all tests pass before marking as verified
- **CRITICAL: Delete test files after verification**
- Make a git commit when complete

Begin by assessing what's been done and what remains to be completed.`;
  }

  /**
   * Main autonomous loop - picks and implements features
   */
  async runLoop(projectPath, sendToRenderer) {
    while (this.autoLoopRunning) {
      let currentFeatureId = null;
      try {
        // Load features from .automaker/feature_list.json
        const features = await this.loadFeatures(projectPath);

        // Find highest priority incomplete feature
        const nextFeature = this.selectNextFeature(features);

        if (!nextFeature) {
          console.log("[AutoMode] No more features to implement");
          sendToRenderer({
            type: "auto_mode_complete",
            message: "All features completed!",
          });
          break;
        }

        currentFeatureId = nextFeature.id;

        // Skip if this feature is already running (via manual trigger)
        if (this.runningFeatures.has(currentFeatureId)) {
          console.log(`[AutoMode] Skipping ${currentFeatureId} - already running`);
          await this.sleep(3000);
          continue;
        }

        console.log(`[AutoMode] Selected feature: ${nextFeature.description}`);

        sendToRenderer({
          type: "auto_mode_feature_start",
          featureId: nextFeature.id,
          feature: nextFeature,
        });

        // Register this feature as running
        this.runningFeatures.set(currentFeatureId, {
          abortController: null,
          query: null,
          projectPath,
          sendToRenderer,
        });

        // Implement the feature
        const result = await this.implementFeature(nextFeature, projectPath, sendToRenderer);

        // Update feature status based on result
        const newStatus = result.passes ? "verified" : "backlog";
        await this.updateFeatureStatus(nextFeature.id, newStatus, projectPath);

        sendToRenderer({
          type: "auto_mode_feature_complete",
          featureId: nextFeature.id,
          passes: result.passes,
          message: result.message,
        });

        // Clean up
        this.runningFeatures.delete(currentFeatureId);

        // Small delay before next feature
        if (this.autoLoopRunning) {
          await this.sleep(3000);
        }
      } catch (error) {
        console.error("[AutoMode] Error in loop iteration:", error);

        sendToRenderer({
          type: "auto_mode_error",
          error: error.message,
          featureId: currentFeatureId,
        });

        // Clean up on error
        if (currentFeatureId) {
          this.runningFeatures.delete(currentFeatureId);
        }

        // Wait before retrying
        await this.sleep(5000);
      }
    }

    console.log("[AutoMode] Loop ended");
    this.autoLoopRunning = false;
  }

  /**
   * Load features from .automaker/feature_list.json
   */
  async loadFeatures(projectPath) {
    const featuresPath = path.join(
      projectPath,
      ".automaker",
      "feature_list.json"
    );

    try {
      const content = await fs.readFile(featuresPath, "utf-8");
      const features = JSON.parse(content);

      // Ensure each feature has an ID
      return features.map((f, index) => ({
        ...f,
        id: f.id || `feature-${index}-${Date.now()}`,
      }));
    } catch (error) {
      console.error("[AutoMode] Failed to load features:", error);
      return [];
    }
  }

  /**
   * Select the next feature to implement
   * Prioritizes: earlier features in the list that are not verified
   */
  selectNextFeature(features) {
    // Find first feature that is in backlog or in_progress status
    return features.find((f) => f.status !== "verified");
  }

  /**
   * Write output to feature context file
   */
  async writeToContextFile(projectPath, featureId, content) {
    if (!projectPath) return;

    try {
      const contextDir = path.join(projectPath, ".automaker", "agents-context");

      // Ensure directory exists
      try {
        await fs.access(contextDir);
      } catch {
        await fs.mkdir(contextDir, { recursive: true });
      }

      const filePath = path.join(contextDir, `${featureId}.md`);

      // Append to existing file or create new one
      try {
        const existing = await fs.readFile(filePath, "utf-8");
        await fs.writeFile(filePath, existing + content, "utf-8");
      } catch {
        await fs.writeFile(filePath, content, "utf-8");
      }
    } catch (error) {
      console.error("[AutoMode] Failed to write to context file:", error);
    }
  }

  /**
   * Delete agent context file for a feature
   */
  async deleteContextFile(projectPath, featureId) {
    if (!projectPath) return;

    try {
      const contextPath = path.join(projectPath, ".automaker", "agents-context", `${featureId}.md`);
      await fs.unlink(contextPath);
      console.log(`[AutoMode] Deleted agent context for feature ${featureId}`);
    } catch (error) {
      // File might not exist, which is fine
      if (error.code !== 'ENOENT') {
        console.error("[AutoMode] Failed to delete context file:", error);
      }
    }
  }

  /**
   * Implement a single feature using Claude Agent SDK
   * Uses a Plan-Act-Verify loop with detailed phase logging
   */
  async implementFeature(feature, projectPath, sendToRenderer) {
    console.log(`[AutoMode] Implementing: ${feature.description}`);

    // Get the execution context for this feature
    const execution = this.runningFeatures.get(feature.id);
    if (!execution) {
      throw new Error(`Feature ${feature.id} not registered in runningFeatures`);
    }

    try {
      // ========================================
      // PHASE 1: PLANNING
      // ========================================
      const planningMessage = `📋 Planning implementation for: ${feature.description}\n`;
      await this.writeToContextFile(projectPath, feature.id, planningMessage);

      sendToRenderer({
        type: "auto_mode_phase",
        featureId: feature.id,
        phase: "planning",
        message: `Planning implementation for: ${feature.description}`,
      });
      console.log(`[AutoMode] Phase: PLANNING for ${feature.description}`);

      const abortController = new AbortController();
      execution.abortController = abortController;

      // Configure options for the SDK query
      const options = {
        model: "claude-opus-4-5-20251101",
        systemPrompt: this.getCodingPrompt(),
        maxTurns: 1000,
        cwd: projectPath,
        allowedTools: [
          "Read",
          "Write",
          "Edit",
          "Glob",
          "Grep",
          "Bash",
          "WebSearch",
          "WebFetch",
        ],
        permissionMode: "acceptEdits",
        sandbox: {
          enabled: true,
          autoAllowBashIfSandboxed: true,
        },
        abortController: abortController,
      };

      // Build the prompt for this specific feature
      const prompt = this.buildFeaturePrompt(feature);

      // Planning: Analyze the codebase and create implementation plan
      sendToRenderer({
        type: "auto_mode_progress",
        featureId: feature.id,
        content:
          "Analyzing codebase structure and creating implementation plan...",
      });

      // Small delay to show planning phase
      await this.sleep(500);

      // ========================================
      // PHASE 2: ACTION
      // ========================================
      const actionMessage = `⚡ Executing implementation for: ${feature.description}\n`;
      await this.writeToContextFile(projectPath, feature.id, actionMessage);

      sendToRenderer({
        type: "auto_mode_phase",
        featureId: feature.id,
        phase: "action",
        message: `Executing implementation for: ${feature.description}`,
      });
      console.log(`[AutoMode] Phase: ACTION for ${feature.description}`);

      // Send query
      const currentQuery = query({ prompt, options });
      execution.query = currentQuery;

      // Stream responses
      let responseText = "";
      let hasStartedToolUse = false;
      for await (const msg of currentQuery) {
        // Check if this specific feature was aborted
        if (!this.runningFeatures.has(feature.id)) break;

        if (msg.type === "assistant" && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === "text") {
              responseText += block.text;

              // Write to context file
              await this.writeToContextFile(projectPath, feature.id, block.text);

              // Stream progress to renderer
              sendToRenderer({
                type: "auto_mode_progress",
                featureId: feature.id,
                content: block.text,
              });
            } else if (block.type === "tool_use") {
              // First tool use indicates we're actively implementing
              if (!hasStartedToolUse) {
                hasStartedToolUse = true;
                const startMsg = "Starting code implementation...\n";
                await this.writeToContextFile(projectPath, feature.id, startMsg);
                sendToRenderer({
                  type: "auto_mode_progress",
                  featureId: feature.id,
                  content: startMsg,
                });
              }

              // Write tool use to context file
              const toolMsg = `\n🔧 Tool: ${block.name}\n`;
              await this.writeToContextFile(projectPath, feature.id, toolMsg);

              // Notify about tool use
              sendToRenderer({
                type: "auto_mode_tool",
                featureId: feature.id,
                tool: block.name,
                input: block.input,
              });
            }
          }
        }
      }

      execution.query = null;
      execution.abortController = null;

      // ========================================
      // PHASE 3: VERIFICATION
      // ========================================
      const verificationMessage = `✅ Verifying implementation for: ${feature.description}\n`;
      await this.writeToContextFile(projectPath, feature.id, verificationMessage);

      sendToRenderer({
        type: "auto_mode_phase",
        featureId: feature.id,
        phase: "verification",
        message: `Verifying implementation for: ${feature.description}`,
      });
      console.log(`[AutoMode] Phase: VERIFICATION for ${feature.description}`);

      const checkingMsg =
        "Verifying implementation and checking test results...\n";
      await this.writeToContextFile(projectPath, feature.id, checkingMsg);
      sendToRenderer({
        type: "auto_mode_progress",
        featureId: feature.id,
        content: checkingMsg,
      });

      // Re-load features to check if it was marked as verified
      const updatedFeatures = await this.loadFeatures(projectPath);
      const updatedFeature = updatedFeatures.find((f) => f.id === feature.id);
      const passes = updatedFeature?.status === "verified";

      // Send verification result
      const resultMsg = passes
        ? "✓ Verification successful: All tests passed\n"
        : "✗ Verification: Tests need attention\n";

      await this.writeToContextFile(projectPath, feature.id, resultMsg);
      sendToRenderer({
        type: "auto_mode_progress",
        featureId: feature.id,
        content: resultMsg,
      });

      return {
        passes,
        message: responseText.substring(0, 500), // First 500 chars
      };
    } catch (error) {
      if (error instanceof AbortError || error?.name === "AbortError") {
        console.log("[AutoMode] Feature run aborted");
        if (execution) {
          execution.abortController = null;
          execution.query = null;
        }
        return {
          passes: false,
          message: "Auto mode aborted",
        };
      }

      console.error("[AutoMode] Error implementing feature:", error);

      // Clean up
      if (execution) {
        execution.abortController = null;
        execution.query = null;
      }

      throw error;
    }
  }

  /**
   * Update feature status in .automaker/feature_list.json
   */
  async updateFeatureStatus(featureId, status, projectPath) {
    const features = await this.loadFeatures(projectPath);
    const feature = features.find((f) => f.id === featureId);

    if (!feature) {
      console.error(`[AutoMode] Feature ${featureId} not found`);
      return;
    }

    // Update the status field
    feature.status = status;

    // Save back to file
    const featuresPath = path.join(
      projectPath,
      ".automaker",
      "feature_list.json"
    );
    const toSave = features.map((f) => ({
      id: f.id,
      category: f.category,
      description: f.description,
      steps: f.steps,
      status: f.status,
    }));

    await fs.writeFile(featuresPath, JSON.stringify(toSave, null, 2), "utf-8");
    console.log(`[AutoMode] Updated feature ${featureId}: status=${status}`);

    // Delete agent context file when feature is verified
    if (status === "verified") {
      await this.deleteContextFile(projectPath, featureId);
    }
  }

  /**
   * Verify feature tests (runs tests and checks if they pass)
   */
  async verifyFeatureTests(feature, projectPath, sendToRenderer) {
    console.log(`[AutoMode] Verifying tests for: ${feature.description}`);

    // Get the execution context for this feature
    const execution = this.runningFeatures.get(feature.id);
    if (!execution) {
      throw new Error(`Feature ${feature.id} not registered in runningFeatures`);
    }

    try {
      const verifyMsg = `\n✅ Verifying tests for: ${feature.description}\n`;
      await this.writeToContextFile(projectPath, feature.id, verifyMsg);

      sendToRenderer({
        type: "auto_mode_phase",
        featureId: feature.id,
        phase: "verification",
        message: `Verifying tests for: ${feature.description}`,
      });

      const abortController = new AbortController();
      execution.abortController = abortController;

      const options = {
        model: "claude-opus-4-5-20251101",
        systemPrompt: this.getVerificationPrompt(),
        maxTurns: 1000,
        cwd: projectPath,
        allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
        permissionMode: "acceptEdits",
        sandbox: {
          enabled: true,
          autoAllowBashIfSandboxed: true,
        },
        abortController: abortController,
      };

      const prompt = this.buildVerificationPrompt(feature);

      const runningTestsMsg =
        "Running Playwright tests to verify feature implementation...\n";
      await this.writeToContextFile(projectPath, feature.id, runningTestsMsg);

      sendToRenderer({
        type: "auto_mode_progress",
        featureId: feature.id,
        content: runningTestsMsg,
      });

      const currentQuery = query({ prompt, options });
      execution.query = currentQuery;

      let responseText = "";
      for await (const msg of currentQuery) {
        // Check if this specific feature was aborted
        if (!this.runningFeatures.has(feature.id)) break;

        if (msg.type === "assistant" && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === "text") {
              responseText += block.text;

              await this.writeToContextFile(projectPath, feature.id, block.text);

              sendToRenderer({
                type: "auto_mode_progress",
                featureId: feature.id,
                content: block.text,
              });
            } else if (block.type === "tool_use") {
              const toolMsg = `\n🔧 Tool: ${block.name}\n`;
              await this.writeToContextFile(projectPath, feature.id, toolMsg);

              sendToRenderer({
                type: "auto_mode_tool",
                featureId: feature.id,
                tool: block.name,
                input: block.input,
              });
            }
          }
        }
      }

      execution.query = null;
      execution.abortController = null;

      // Re-load features to check if it was marked as verified
      const updatedFeatures = await this.loadFeatures(projectPath);
      const updatedFeature = updatedFeatures.find((f) => f.id === feature.id);
      const passes = updatedFeature?.status === "verified";

      const finalMsg = passes
        ? "✓ Verification successful: All tests passed\n"
        : "✗ Tests failed or not all passing - feature remains in progress\n";

      await this.writeToContextFile(projectPath, feature.id, finalMsg);

      sendToRenderer({
        type: "auto_mode_progress",
        featureId: feature.id,
        content: finalMsg,
      });

      return {
        passes,
        message: responseText.substring(0, 500),
      };
    } catch (error) {
      if (error instanceof AbortError || error?.name === "AbortError") {
        console.log("[AutoMode] Verification aborted");
        if (execution) {
          execution.abortController = null;
          execution.query = null;
        }
        return {
          passes: false,
          message: "Verification aborted",
        };
      }

      console.error("[AutoMode] Error verifying feature:", error);
      if (execution) {
        execution.abortController = null;
        execution.query = null;
      }
      throw error;
    }
  }

  /**
   * Build the prompt for implementing a specific feature
   */
  buildFeaturePrompt(feature) {
    return `You are working on a feature implementation task.

**Current Feature to Implement:**

Category: ${feature.category}
Description: ${feature.description}

**Steps to Complete:**
${feature.steps.map((step, i) => `${i + 1}. ${step}`).join("\n")}

**Your Task:**

1. Read the project files to understand the current codebase structure
2. Implement the feature according to the description and steps
3. Write Playwright tests to verify the feature works correctly
4. Run the tests and ensure they pass
5. **DELETE the test file(s) you created** - tests are only for immediate verification
6. Update .automaker/feature_list.json to mark this feature as "status": "verified"
7. Commit your changes with git

**Important Guidelines:**

- Focus ONLY on implementing this specific feature
- Write clean, production-quality code
- Add proper error handling
- Write comprehensive Playwright tests
- Ensure all existing tests still pass
- Mark the feature as passing only when all tests are green
- **CRITICAL: Delete test files after verification** - tests accumulate and become brittle
- Make a git commit when complete

**Testing Utilities (CRITICAL):**

1. **Create/maintain tests/utils.ts** - Add helper functions for finding elements and common test operations
2. **Use utilities in tests** - Import and use helper functions instead of repeating selectors
3. **Add utilities as needed** - When you write a test, if you need a new helper, add it to utils.ts
4. **Update utilities when functionality changes** - If you modify components, update corresponding utilities

Example utilities to add:
- getByTestId(page, testId) - Find elements by data-testid
- getButtonByText(page, text) - Find buttons by text
- clickElement(page, testId) - Click an element by test ID
- fillForm(page, formData) - Fill form fields
- waitForElement(page, testId) - Wait for element to appear

This makes future tests easier to write and maintain!

**Test Deletion Policy:**
After tests pass, delete them immediately:
\`\`\`bash
rm tests/[feature-name].spec.ts
\`\`\`

Begin by reading the project structure and then implementing the feature.`;
  }

  /**
   * Build the prompt for verifying a specific feature
   */
  buildVerificationPrompt(feature) {
    return `You are implementing and verifying a feature until it is complete and working correctly.

**Feature to Implement/Verify:**

ID: ${feature.id}
Category: ${feature.category}
Description: ${feature.description}
Current Status: ${feature.status}

**Steps that should be implemented:**
${feature.steps.map((step, i) => `${i + 1}. ${step}`).join("\n")}

**Your Task:**

1. Read the project files to understand the current implementation
2. If the feature is not fully implemented, continue implementing it
3. Write or update Playwright tests to verify the feature works correctly
4. Run the Playwright tests: npx playwright test tests/[feature-name].spec.ts
5. Check if all tests pass
6. **If ANY tests fail:**
   - Analyze the test failures and error messages
   - Fix the implementation code to make the tests pass
   - Update test utilities in tests/utils.ts if needed
   - Re-run the tests to verify the fixes
   - **REPEAT this process until ALL tests pass**
   - Keep the feature "status" as "in_progress" in .automaker/feature_list.json
7. **If ALL tests pass:**
   - **DELETE the test file(s) for this feature** - tests are only for immediate verification
   - Update .automaker/feature_list.json to set this feature's "status" to "verified"
   - Explain what was implemented/fixed and that all tests passed
   - Commit your changes with git

**Testing Utilities:**
- Check if tests/utils.ts exists and is being used
- If utilities are outdated due to functionality changes, update them
- Add new utilities as needed for this feature's tests
- Ensure test utilities stay in sync with code changes

**Test Deletion Policy:**
After tests pass, delete them immediately:
\`\`\`bash
rm tests/[feature-name].spec.ts
\`\`\`

**Important:**
- **CONTINUE IMPLEMENTING until all tests pass** - don't stop at the first failure
- Only mark as "verified" if Playwright tests pass
- **CRITICAL: Delete test files after they pass** - tests should not accumulate
- Update test utilities if functionality changed
- Make a git commit when the feature is complete
- Be thorough and persistent in fixing issues

Begin by reading the project structure and understanding what needs to be implemented or fixed.`;
  }

  /**
   * Get the system prompt for verification agent
   */
  getVerificationPrompt() {
    return `You are an AI implementation and verification agent focused on completing features and ensuring they work.

Your role is to:
- **Continue implementing features until they are complete** - don't stop at the first failure
- Write or update code to fix failing tests
- Run Playwright tests to verify feature implementations
- If tests fail, analyze errors and fix the implementation
- If other tests fail, verify if those tests are still accurate or should be updated or deleted
- Continue rerunning tests and fixing issues until ALL tests pass
- **DELETE test files after successful verification** - tests are only for immediate feature verification
- Update feature status to verified in .automaker/feature_list.json after all tests pass
- **Update test utilities (tests/utils.ts) if functionality changed** - keep helpers in sync with code
- Commit working code to git

**Testing Utilities:**
- Check if tests/utils.ts needs updates based on code changes
- If a component's selectors or behavior changed, update the corresponding utility functions
- Add new utilities as needed for the feature's tests
- Ensure utilities remain accurate and helpful for future tests

**Test Deletion Policy:**
Tests should NOT accumulate. After a feature is verified:
1. Delete the test file for that feature
2. Mark the feature as "verified" in feature_list.json

This prevents test brittleness as the app changes rapidly.

You have access to:
- Read and edit files
- Write new code or modify existing code
- Run bash commands (especially Playwright tests)
- Delete files (rm command)
- Analyze test output
- Make git commits

**CRITICAL:** Be persistent and thorough - keep iterating on the implementation until all tests pass. Don't give up after the first failure. Always delete tests after they pass and commit your work.`;
  }

  /**
   * Get the system prompt for coding agent
   */
  getCodingPrompt() {
    return `You are an AI coding agent working autonomously to implement features.

Your role is to:
- Implement features exactly as specified
- Write production-quality code
- Create comprehensive Playwright tests using testing utilities
- Ensure all tests pass before marking features complete
- **DELETE test files after successful verification** - tests are only for immediate feature verification
- Commit working code to git
- Be thorough and detail-oriented

**Testing Utilities (CRITICAL):**
- **Create and maintain tests/utils.ts** with helper functions for finding elements and common operations
- **Always use utilities in tests** instead of repeating selectors
- **Add new utilities as you write tests** - if you need a helper, add it to utils.ts
- **Update utilities when functionality changes** - keep helpers in sync with code changes

This makes future tests easier to write and more maintainable!

**Test Deletion Policy:**
Tests should NOT accumulate. After a feature is verified:
1. Run the tests to ensure they pass
2. Delete the test file for that feature
3. Mark the feature as "verified" in .automaker/feature_list.json

This prevents test brittleness as the app changes rapidly.

You have full access to:
- Read and write files
- Run bash commands
- Execute tests
- Delete files (rm command)
- Make git commits
- Search and analyze the codebase

Focus on one feature at a time and complete it fully before finishing. Always delete tests after they pass.`;
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
module.exports = new AutoModeService();
