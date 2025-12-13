/**
 * Note-Taker Agent
 * Extracts structured knowledge from interview transcript segments
 */

/**
 * Returns the system prompt for the Note-Taker agent
 * @returns {string} The system prompt
 */
function getSystemPrompt() {
  return `You are a knowledge extraction specialist analyzing interview transcripts for succession planning.

Your role is to extract structured insights from interview segments between an interviewer and a domain expert. Focus on capturing tacit knowledge - the implicit understanding, mental models, decision-making frameworks, and contextual wisdom that would help a successor truly understand how the expert thinks and operates.

For each transcript segment, analyze and extract:

1. **Topics Covered**: The specific subjects, areas, or domains discussed
2. **Key Insights**: Critical knowledge, principles, or wisdom shared by the expert
3. **Frameworks Mentioned**: Any methodologies, models, processes, or systematic approaches referenced
4. **Gaps**: Areas where more depth or clarity would be valuable
5. **Suggested Probes**: Follow-up questions to deepen understanding or fill gaps

Guidelines:
- Be thorough but concise
- Focus on actionable knowledge, not just facts
- Capture the "why" and "how" behind decisions, not just the "what"
- Identify implicit assumptions and mental models
- Note any context-specific wisdom that might not be obvious to outsiders
- Prioritize insights that would be difficult to find in documentation

You MUST respond with valid JSON in this exact structure:
{
  "topicsCovered": ["topic1", "topic2"],
  "keyInsights": ["insight1", "insight2"],
  "frameworksMentioned": ["framework1"],
  "gaps": ["gap1"],
  "suggestedProbes": ["question1"]
}

Ensure all arrays contain strings. If a category has no items, use an empty array.`;
}

/**
 * Extracts JSON from the LLM response
 * @param {string} response - The raw LLM response
 * @returns {Object} Parsed JSON object with extracted knowledge
 */
function parseResponse(response) {
  // Remove markdown code blocks if present
  let cleaned = response.trim();

  // Remove ```json and ``` markers
  cleaned = cleaned.replace(/^```json\s*/i, '');
  cleaned = cleaned.replace(/^```\s*/, '');
  cleaned = cleaned.replace(/```\s*$/, '');

  // Find JSON object in the response
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    throw new Error('No JSON object found in response');
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    // Validate structure
    const required = ['topicsCovered', 'keyInsights', 'frameworksMentioned', 'gaps', 'suggestedProbes'];
    for (const field of required) {
      if (!Array.isArray(parsed[field])) {
        throw new Error(`Missing or invalid field: ${field}`);
      }
    }

    return parsed;
  } catch (error) {
    throw new Error(`Failed to parse response: ${error.message}`);
  }
}

module.exports = { getSystemPrompt, parseResponse };
