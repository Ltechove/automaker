/**
 * Business logic for generating suggestions
 */

import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import type { EventEmitter } from "../../lib/events.js";
import { createLogger } from "../../lib/logger.js";

const logger = createLogger("Suggestions");

export async function generateSuggestions(
  projectPath: string,
  suggestionType: string,
  events: EventEmitter,
  abortController: AbortController
): Promise<void> {
  const typePrompts: Record<string, string> = {
    features:
      "Analyze this project and suggest new features that would add value.",
    refactoring: "Analyze this project and identify refactoring opportunities.",
    security:
      "Analyze this project for security vulnerabilities and suggest fixes.",
    performance:
      "Analyze this project for performance issues and suggest optimizations.",
  };

  const prompt = `${typePrompts[suggestionType] || typePrompts.features}

Look at the codebase and provide 3-5 concrete suggestions.

For each suggestion, provide:
1. A category (e.g., "User Experience", "Security", "Performance")
2. A clear description of what to implement
3. Concrete steps to implement it
4. Priority (1=high, 2=medium, 3=low)
5. Brief reasoning for why this would help

Format your response as JSON:
{
  "suggestions": [
    {
      "id": "suggestion-123",
      "category": "Category",
      "description": "What to implement",
      "steps": ["Step 1", "Step 2"],
      "priority": 1,
      "reasoning": "Why this helps"
    }
  ]
}`;

  events.emit("suggestions:event", {
    type: "suggestions_progress",
    content: `Starting ${suggestionType} analysis...\n`,
  });

  const options: Options = {
    model: "claude-opus-4-5-20251101",
    maxTurns: 5,
    cwd: projectPath,
    allowedTools: ["Read", "Glob", "Grep"],
    permissionMode: "acceptEdits",
    abortController,
  };

  const stream = query({ prompt, options });
  let responseText = "";

  for await (const msg of stream) {
    if (msg.type === "assistant" && msg.message.content) {
      for (const block of msg.message.content) {
        if (block.type === "text") {
          responseText = block.text;
          events.emit("suggestions:event", {
            type: "suggestions_progress",
            content: block.text,
          });
        } else if (block.type === "tool_use") {
          events.emit("suggestions:event", {
            type: "suggestions_tool",
            tool: block.name,
            input: block.input,
          });
        }
      }
    } else if (msg.type === "result" && msg.subtype === "success") {
      responseText = msg.result || responseText;
    }
  }

  // Parse suggestions from response
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*"suggestions"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      events.emit("suggestions:event", {
        type: "suggestions_complete",
        suggestions: parsed.suggestions.map(
          (s: Record<string, unknown>, i: number) => ({
            ...s,
            id: s.id || `suggestion-${Date.now()}-${i}`,
          })
        ),
      });
    } else {
      throw new Error("No valid JSON found in response");
    }
  } catch (error) {
    // Log the parsing error for debugging
    logger.error("Failed to parse suggestions JSON from AI response:", error);
    // Return generic suggestions if parsing fails
    events.emit("suggestions:event", {
      type: "suggestions_complete",
      suggestions: [
        {
          id: `suggestion-${Date.now()}-0`,
          category: "Analysis",
          description: "Review the AI analysis output for insights",
          steps: ["Review the generated analysis"],
          priority: 1,
          reasoning:
            "The AI provided analysis but suggestions need manual review",
        },
      ],
    });
  }
}
