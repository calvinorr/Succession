/**
 * Knowledge Builder Agent
 *
 * Synthesizes interview conversations into structured knowledge entries
 * following the 8-section procedures manual format.
 */

/**
 * The 8 sections that make up a knowledge entry
 */
const SECTIONS = [
  { key: 'overview', name: 'Overview', description: 'What this topic is and why it matters' },
  { key: 'frequency', name: 'Frequency', description: 'How often this occurs (daily/weekly/monthly/quarterly/annual/ad-hoc)' },
  { key: 'keyTasks', name: 'Key Tasks', description: 'Step-by-step actions required' },
  { key: 'keyDates', name: 'Key Dates', description: 'Important deadlines and timing triggers' },
  { key: 'contacts', name: 'Contacts', description: 'Key people to contact and when' },
  { key: 'systemsAndTools', name: 'Systems & Tools', description: 'Software, templates, and resources used' },
  { key: 'watchOutFor', name: 'Watch Out For', description: 'Common pitfalls and things that can go wrong' },
  { key: 'proTips', name: 'Pro Tips', description: 'Insider knowledge and efficiency tricks' },
];

/**
 * Returns the system prompt for the Knowledge Builder agent
 * @param {Object} topic - The topic being synthesized
 * @param {Array} allTopics - All topics for cross-reference detection
 * @returns {string} The system prompt
 */
function getSystemPrompt(topic, allTopics = []) {
  const otherTopics = allTopics
    .filter(t => t.id !== topic.id)
    .map(t => `- ${t.name}`)
    .join('\n');

  return `You are a senior management consultant specialising in knowledge capture and documentation. Your task is to synthesise an expert interview into a structured procedures manual entry.

# Context

You are documenting knowledge for **${topic.name}** in a local authority finance department.
${topic.description ? `Topic description: ${topic.description}` : ''}
${topic.frequency ? `Frequency: ${topic.frequency}` : ''}

# Output Format

Create a structured knowledge entry with exactly 8 sections. Each section must be practical, actionable, and written in clear professional English. Maintain the expert's voice while ensuring McKinsey-quality documentation standards.

## Required Sections

1. **Overview**: What this is and why it matters. 2-3 sentences explaining the purpose and importance.

2. **Frequency**: How often this task/process occurs. Be specific (e.g., "Monthly, by the 5th working day" not just "Monthly").

3. **Key Tasks**: Step-by-step actions. Number each step. Be specific and actionable. Include who does what.

4. **Key Dates**: Critical deadlines and timing triggers. Include both internal and external deadlines.

5. **Contacts**: Key people and when to contact them. Include role, not just name where possible.

6. **Systems & Tools**: Software, templates, spreadsheets, and resources used. Include file locations where mentioned.

7. **Watch Out For**: Common pitfalls, things that go wrong, and risks. Be specific about what can fail and why.

8. **Pro Tips**: Insider knowledge, efficiency tricks, and wisdom that only comes from experience.

# Quality Standards

- Write in clear, professional English
- Be specific and concrete, not generic
- Include actual names, systems, dates mentioned in the interview
- If information for a section wasn't discussed, write "Not covered in interview" rather than making things up
- Maintain the expert's authentic voice while being professional
- Focus on actionable knowledge a successor could use immediately

# Cross-References

${otherTopics ? `Other topics in this knowledge base:\n${otherTopics}\n\nIdentify any connections to these topics that would help a successor understand relationships.` : 'No other topics defined yet.'}

# Response Format

You MUST respond with valid JSON in this exact structure:
{
  "sections": {
    "overview": "string - 2-3 sentence overview",
    "frequency": "string - specific frequency description",
    "keyTasks": ["string - step 1", "string - step 2", ...],
    "keyDates": ["string - date/deadline 1", ...],
    "contacts": ["string - contact 1", ...],
    "systemsAndTools": ["string - system/tool 1", ...],
    "watchOutFor": ["string - pitfall 1", ...],
    "proTips": ["string - tip 1", ...]
  },
  "crossReferences": [
    {
      "topicName": "string - name of related topic",
      "reason": "string - why these topics are connected"
    }
  ],
  "qualityNotes": "string - any concerns about completeness or areas needing follow-up"
}

Ensure all array fields contain strings. Use empty arrays [] if no items. Never use null.`;
}

/**
 * Formats interview messages as a transcript for the LLM
 * @param {Array} messages - Array of message objects with role and content
 * @returns {string} Formatted transcript
 */
function formatTranscript(messages) {
  return messages
    .map(msg => {
      const speaker = msg.role === 'user' ? 'Expert' : 'Interviewer';
      return `${speaker}: ${msg.content}`;
    })
    .join('\n\n');
}

/**
 * Parses and validates the LLM response
 * @param {string} response - Raw LLM response
 * @returns {Object} Parsed knowledge entry data
 */
function parseResponse(response) {
  // Remove markdown code blocks if present
  let cleaned = response.trim();
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

    // Validate sections structure
    if (!parsed.sections || typeof parsed.sections !== 'object') {
      throw new Error('Missing or invalid sections object');
    }

    // Validate each section
    const requiredSections = ['overview', 'frequency', 'keyTasks', 'keyDates', 'contacts', 'systemsAndTools', 'watchOutFor', 'proTips'];

    for (const section of requiredSections) {
      if (parsed.sections[section] === undefined) {
        throw new Error(`Missing section: ${section}`);
      }
    }

    // Ensure string sections are strings
    if (typeof parsed.sections.overview !== 'string') {
      parsed.sections.overview = String(parsed.sections.overview || 'Not covered in interview');
    }
    if (typeof parsed.sections.frequency !== 'string') {
      parsed.sections.frequency = String(parsed.sections.frequency || 'Not covered in interview');
    }

    // Ensure array sections are arrays
    const arraySections = ['keyTasks', 'keyDates', 'contacts', 'systemsAndTools', 'watchOutFor', 'proTips'];
    for (const section of arraySections) {
      if (!Array.isArray(parsed.sections[section])) {
        parsed.sections[section] = parsed.sections[section] ? [String(parsed.sections[section])] : [];
      }
      // Ensure all items are strings
      parsed.sections[section] = parsed.sections[section].map(item => String(item));
    }

    // Validate crossReferences
    if (!Array.isArray(parsed.crossReferences)) {
      parsed.crossReferences = [];
    }
    parsed.crossReferences = parsed.crossReferences.filter(ref =>
      ref && typeof ref.topicName === 'string' && typeof ref.reason === 'string'
    );

    // Ensure qualityNotes is a string
    if (typeof parsed.qualityNotes !== 'string') {
      parsed.qualityNotes = '';
    }

    return parsed;
  } catch (error) {
    throw new Error(`Failed to parse response: ${error.message}`);
  }
}

/**
 * Resolves cross-reference topic names to topic IDs
 * @param {Array} crossReferences - Array of cross-references with topicName
 * @param {Array} allTopics - All available topics
 * @returns {Array} Cross-references with topicId added where matched
 */
function resolveCrossReferences(crossReferences, allTopics) {
  return crossReferences.map(ref => {
    // Try to find matching topic by name (case-insensitive)
    const matchedTopic = allTopics.find(t =>
      t.name.toLowerCase() === ref.topicName.toLowerCase() ||
      t.name.toLowerCase().includes(ref.topicName.toLowerCase()) ||
      ref.topicName.toLowerCase().includes(t.name.toLowerCase())
    );

    return {
      topicId: matchedTopic ? matchedTopic.id : null,
      topicName: ref.topicName,
      reason: ref.reason,
    };
  });
}

module.exports = {
  SECTIONS,
  getSystemPrompt,
  formatTranscript,
  parseResponse,
  resolveCrossReferences,
};
