/**
 * AI Interviewer Agent - Topic-aware system prompts for knowledge capture
 *
 * Story 7.2: Expert Finance Interviewer Agent
 * - Local authority finance domain knowledge
 * - Topic-aware question generation
 * - Coverage tracking (8 areas: overview, tasks, dates, contacts, systems, pitfalls, tips, related)
 */

// Knowledge areas to cover for each topic (Story 7.3 output format)
const KNOWLEDGE_AREAS = [
  { key: 'overview', name: 'Overview', prompt: 'What is this and why does it matter?' },
  { key: 'tasks', name: 'Key Tasks', prompt: 'What are the step-by-step actions?' },
  { key: 'dates', name: 'Key Dates', prompt: 'What are the deadlines and triggers?' },
  { key: 'contacts', name: 'Contacts', prompt: 'Who do you need to work with?' },
  { key: 'systems', name: 'Systems & Tools', prompt: 'What software/templates are used?' },
  { key: 'pitfalls', name: 'Watch Out For', prompt: 'What are common mistakes or pitfalls?' },
  { key: 'tips', name: 'Pro Tips', prompt: 'What insider knowledge would help a successor?' },
  { key: 'related', name: 'Related Topics', prompt: 'What other areas does this connect to?' },
];

// Local Authority Finance domain knowledge
const LA_FINANCE_KNOWLEDGE = {
  terminology: {
    'MTFS': 'Medium Term Financial Strategy - multi-year financial planning document',
    'S151': 'Section 151 Officer - statutory chief finance officer role',
    'PWLB': 'Public Works Loan Board - government lending to local authorities',
    'MRP': 'Minimum Revenue Provision - statutory debt repayment',
    'HRA': 'Housing Revenue Account - ring-fenced housing finance',
    'DSG': 'Dedicated Schools Grant - education funding',
    'NNDR': 'National Non-Domestic Rates - business rates',
    'Collection Fund': 'Accounting for council tax and business rates',
    'Prudential Code': 'CIPFA framework for capital finance decisions',
    'Treasury Management': 'Managing cash, investments and borrowing',
    'Outturn': 'Actual spending compared to budget',
    'Virement': 'Transfer of budget between headings',
    'Earmarked Reserves': 'Reserves set aside for specific purposes',
    'General Fund': 'Main revenue account for council services',
  },

  commonTopics: {
    'month-end': ['journal processing', 'accruals', 'prepayments', 'suspense clearance', 'bank reconciliation', 'control accounts'],
    'year-end': ['closedown timetable', 'final accounts', 'audit preparation', 'working papers', 'disclosure notes', 'AGS'],
    'budget': ['budget setting', 'budget monitoring', 'variance analysis', 'forecasting', 'savings tracking', 'growth bids'],
    'treasury': ['cash flow', 'investments', 'borrowing', 'counterparty limits', 'interest rates', 'prudential indicators'],
    'vat': ['partial exemption', 'VAT returns', 'reverse charge', 'exempt supplies', 'capital goods scheme'],
    'payroll': ['pension contributions', 'tax codes', 'statutory payments', 'P11D', 'gender pay reporting'],
    'procurement': ['contract standing orders', 'tender evaluation', 'framework agreements', 'social value'],
    'grants': ['grant conditions', 'claiming procedures', 'audit requirements', 'clawback risk'],
    'capital': ['capital programme', 'financing', 'project monitoring', 'slippage', 'capitalisation'],
    'audit': ['internal audit', 'external audit', 'audit committee', 'management responses', 'follow-up'],
  },

  stakeholders: {
    internal: ['Chief Executive', 'Directors', 'Service Managers', 'HR', 'Legal', 'IT', 'Democratic Services'],
    external: ['External Auditors', 'Internal Audit', 'CIPFA', 'LGA', 'Government Departments', 'Banks', 'Suppliers'],
    political: ['Leader', 'Cabinet', 'Scrutiny Committee', 'Audit Committee', 'Full Council'],
  },

  systems: ['Oracle', 'SAP', 'Unit4', 'Agresso', 'Civica', 'Academy', 'Integra', 'BACS', 'Bankline'],
};

const ROLE_CONTEXTS = {
  "Finance Director": {
    domain: "Strategic financial leadership, budgeting, reserves, MTFS, political considerations, savings programs",
    keyAreas: [
      "Medium Term Financial Strategy (MTFS) development and monitoring",
      "Budget setting and monitoring processes",
      "Reserves strategy and adequacy assessment",
      "Savings programs and efficiency initiatives",
      "Political and member engagement on financial matters",
      "Section 151 officer responsibilities and risk management",
      "Financial reporting to council and scrutiny",
      "Treasury management strategy oversight",
      "Capital program planning and financing"
    ]
  },
  "Head of AP": {
    domain: "Accounts Payable operations, invoice processing, supplier relationships, fraud detection, payment controls",
    keyAreas: [
      "Invoice processing workflows and automation",
      "Supplier onboarding and relationship management",
      "Fraud detection and prevention controls",
      "Payment run processes and authorization",
      "Purchase order matching and three-way reconciliation",
      "Duplicate payment prevention",
      "Supplier query resolution and dispute management",
      "VAT compliance on purchases",
      "Month-end creditor management",
      "System configuration and integrations"
    ]
  },
  "Head of AR": {
    domain: "Accounts Receivable operations, debt collection, customer relationships, write-offs, escalation procedures",
    keyAreas: [
      "Invoicing processes and accuracy",
      "Debt collection strategies and escalation",
      "Customer relationship management during collection",
      "Write-off criteria and approval processes",
      "Aged debt analysis and prioritization",
      "Legal action decisions and external agency use",
      "Payment plan negotiation and management",
      "Cash allocation and reconciliation",
      "Bad debt provisioning recommendations",
      "Sensitive cases (vulnerable customers, financial hardship)"
    ]
  },
  "Head of Treasury": {
    domain: "Cash management, investments, borrowing, banking relationships, treasury strategy",
    keyAreas: [
      "Daily cash flow forecasting and monitoring",
      "Investment strategy and counterparty selection",
      "Borrowing decisions and PWLB relationships",
      "Banking relationship management",
      "Treasury Management Strategy and practices",
      "Prudential indicators and compliance",
      "Interest rate risk management",
      "Liquidity management and reserves access",
      "Bank account structure and mandates",
      "Treasury system management and reporting"
    ]
  }
};

// Story 5.1: Role Topic Checklists - Structured topics to cover for each role
const ROLE_TOPIC_CHECKLISTS = {
  "Finance Director": {
    description: "Strategic financial leadership for the local authority",
    topics: [
      {
        id: "mtfs-development",
        name: "MTFS Development & Planning",
        description: "Medium Term Financial Strategy creation, updates, and political approval process",
        isProcessOriented: true,
        requiredAreas: ["overview", "tasks", "dates", "contacts", "pitfalls", "tips"]
      },
      {
        id: "budget-setting",
        name: "Annual Budget Setting",
        description: "The annual budget cycle from planning through Council approval",
        isProcessOriented: true,
        requiredAreas: ["overview", "tasks", "dates", "contacts", "systems", "pitfalls", "tips"]
      },
      {
        id: "budget-monitoring",
        name: "In-Year Budget Monitoring",
        description: "Monthly/quarterly monitoring, variance analysis, and reporting to members",
        isProcessOriented: true,
        requiredAreas: ["overview", "tasks", "dates", "contacts", "systems", "pitfalls", "tips"]
      },
      {
        id: "reserves-strategy",
        name: "Reserves & Balances Strategy",
        description: "Assessing reserves adequacy, earmarked reserves, and risk assessment",
        isProcessOriented: false,
        requiredAreas: ["overview", "tasks", "contacts", "pitfalls", "tips", "related"]
      },
      {
        id: "savings-programmes",
        name: "Savings & Efficiency Programmes",
        description: "Identifying, tracking, and delivering savings across the authority",
        isProcessOriented: true,
        requiredAreas: ["overview", "tasks", "dates", "contacts", "pitfalls", "tips"]
      },
      {
        id: "member-engagement",
        name: "Political & Member Engagement",
        description: "Working with Cabinet, Scrutiny, and Council on financial matters",
        isProcessOriented: false,
        requiredAreas: ["overview", "contacts", "pitfalls", "tips", "related"]
      },
      {
        id: "s151-responsibilities",
        name: "Section 151 Officer Duties",
        description: "Statutory responsibilities, S114 notices, and legal requirements",
        isProcessOriented: false,
        requiredAreas: ["overview", "tasks", "contacts", "pitfalls", "tips"]
      },
      {
        id: "year-end-closedown",
        name: "Year-End & Accounts Closedown",
        description: "Final accounts preparation, audit, and AGS",
        isProcessOriented: true,
        requiredAreas: ["overview", "tasks", "dates", "contacts", "systems", "pitfalls", "tips"]
      },
      {
        id: "capital-programme",
        name: "Capital Programme Management",
        description: "Capital planning, financing decisions, and monitoring",
        isProcessOriented: true,
        requiredAreas: ["overview", "tasks", "dates", "contacts", "systems", "pitfalls", "tips"]
      }
    ]
  },
  "Head of AP": {
    description: "Accounts Payable operations and supplier payment management",
    topics: [
      {
        id: "invoice-processing",
        name: "Invoice Processing Workflow",
        description: "End-to-end invoice receipt, validation, coding, and approval",
        isProcessOriented: true,
        requiredAreas: ["overview", "tasks", "systems", "pitfalls", "tips"]
      },
      {
        id: "payment-runs",
        name: "Payment Run Processing",
        description: "BACS runs, faster payments, cheques, and payment scheduling",
        isProcessOriented: true,
        requiredAreas: ["overview", "tasks", "dates", "systems", "pitfalls", "tips"]
      },
      {
        id: "supplier-management",
        name: "Supplier Setup & Management",
        description: "New supplier onboarding, bank detail changes, and master data",
        isProcessOriented: true,
        requiredAreas: ["overview", "tasks", "contacts", "systems", "pitfalls", "tips"]
      },
      {
        id: "fraud-prevention",
        name: "Fraud Detection & Prevention",
        description: "Controls, red flags, bank detail verification, and fraud response",
        isProcessOriented: false,
        requiredAreas: ["overview", "tasks", "contacts", "pitfalls", "tips", "related"]
      },
      {
        id: "po-matching",
        name: "Purchase Order Matching",
        description: "Three-way matching, GRN processing, and exception handling",
        isProcessOriented: true,
        requiredAreas: ["overview", "tasks", "systems", "pitfalls", "tips"]
      },
      {
        id: "duplicate-prevention",
        name: "Duplicate Payment Prevention",
        description: "Controls and processes to prevent and detect duplicate payments",
        isProcessOriented: true,
        requiredAreas: ["overview", "tasks", "systems", "pitfalls", "tips"]
      },
      {
        id: "supplier-queries",
        name: "Supplier Query Resolution",
        description: "Handling supplier enquiries, disputes, and escalations",
        isProcessOriented: true,
        requiredAreas: ["overview", "tasks", "contacts", "pitfalls", "tips"]
      },
      {
        id: "vat-compliance",
        name: "VAT Compliance on Purchases",
        description: "VAT treatment, reverse charge, and VAT return input",
        isProcessOriented: false,
        requiredAreas: ["overview", "tasks", "systems", "pitfalls", "tips"]
      },
      {
        id: "month-end-ap",
        name: "Month-End Creditor Processes",
        description: "Accruals, cut-off, reconciliations, and reporting",
        isProcessOriented: true,
        requiredAreas: ["overview", "tasks", "dates", "systems", "pitfalls", "tips"]
      }
    ]
  },
  "Head of AR": {
    description: "Accounts Receivable operations and debt collection management",
    topics: [
      {
        id: "invoicing-process",
        name: "Invoicing & Billing Process",
        description: "Invoice creation, approval, and dispatch workflows",
        isProcessOriented: true,
        requiredAreas: ["overview", "tasks", "systems", "pitfalls", "tips"]
      },
      {
        id: "debt-collection",
        name: "Debt Collection Process",
        description: "Collection stages, escalation paths, and follow-up procedures",
        isProcessOriented: true,
        requiredAreas: ["overview", "tasks", "dates", "contacts", "systems", "pitfalls", "tips"]
      },
      {
        id: "aged-debt-management",
        name: "Aged Debt Analysis & Prioritisation",
        description: "Reviewing aged debt, prioritising collection, and reporting",
        isProcessOriented: true,
        requiredAreas: ["overview", "tasks", "dates", "systems", "pitfalls", "tips"]
      },
      {
        id: "payment-plans",
        name: "Payment Plan Negotiation",
        description: "Setting up payment plans, monitoring, and handling defaults",
        isProcessOriented: true,
        requiredAreas: ["overview", "tasks", "contacts", "pitfalls", "tips"]
      },
      {
        id: "write-off-process",
        name: "Write-Off Procedures",
        description: "Write-off criteria, approval levels, and processing",
        isProcessOriented: true,
        requiredAreas: ["overview", "tasks", "contacts", "pitfalls", "tips"]
      },
      {
        id: "legal-escalation",
        name: "Legal Action & External Agencies",
        description: "When and how to escalate to legal action or debt agencies",
        isProcessOriented: true,
        requiredAreas: ["overview", "tasks", "contacts", "pitfalls", "tips", "related"]
      },
      {
        id: "vulnerable-customers",
        name: "Vulnerable Customer Handling",
        description: "Identifying vulnerability, appropriate collection approaches, and support",
        isProcessOriented: false,
        requiredAreas: ["overview", "tasks", "contacts", "pitfalls", "tips"]
      },
      {
        id: "cash-allocation",
        name: "Cash Allocation & Reconciliation",
        description: "Allocating payments, handling unidentified receipts, and reconciliation",
        isProcessOriented: true,
        requiredAreas: ["overview", "tasks", "systems", "pitfalls", "tips"]
      },
      {
        id: "bad-debt-provision",
        name: "Bad Debt Provisioning",
        description: "Calculating provisions, reporting, and year-end processes",
        isProcessOriented: true,
        requiredAreas: ["overview", "tasks", "dates", "systems", "pitfalls", "tips"]
      }
    ]
  },
  "Head of Treasury": {
    description: "Cash management, investments, borrowing, and banking relationships",
    topics: [
      {
        id: "daily-cashflow",
        name: "Daily Cash Flow Management",
        description: "Daily cash position, forecasting, and balancing",
        isProcessOriented: true,
        requiredAreas: ["overview", "tasks", "dates", "systems", "pitfalls", "tips"]
      },
      {
        id: "investment-strategy",
        name: "Investment Strategy & MMFs",
        description: "Investment policy, counterparty selection, and MMF management",
        isProcessOriented: false,
        requiredAreas: ["overview", "tasks", "contacts", "systems", "pitfalls", "tips", "related"]
      },
      {
        id: "borrowing-decisions",
        name: "Borrowing & Debt Management",
        description: "PWLB, internal borrowing, debt restructuring decisions",
        isProcessOriented: false,
        requiredAreas: ["overview", "tasks", "contacts", "pitfalls", "tips", "related"]
      },
      {
        id: "banking-relationships",
        name: "Banking Relationships",
        description: "Bank account management, mandates, and relationship management",
        isProcessOriented: false,
        requiredAreas: ["overview", "contacts", "systems", "pitfalls", "tips"]
      },
      {
        id: "urgent-payments",
        name: "Urgent Payment Processing",
        description: "Same-day payments, faster payments, and emergency procedures",
        isProcessOriented: true,
        requiredAreas: ["overview", "tasks", "contacts", "systems", "pitfalls", "tips"]
      },
      {
        id: "prudential-indicators",
        name: "Prudential Indicators & Compliance",
        description: "Monitoring and reporting prudential indicators, TM strategy compliance",
        isProcessOriented: true,
        requiredAreas: ["overview", "tasks", "dates", "pitfalls", "tips"]
      },
      {
        id: "year-end-treasury",
        name: "Year-End Treasury Processes",
        description: "Year-end valuations, reconciliations, and audit requirements",
        isProcessOriented: true,
        requiredAreas: ["overview", "tasks", "dates", "systems", "pitfalls", "tips"]
      },
      {
        id: "risk-management",
        name: "Treasury Risk Management",
        description: "Interest rate risk, counterparty risk, and liquidity risk",
        isProcessOriented: false,
        requiredAreas: ["overview", "contacts", "pitfalls", "tips", "related"]
      },
      {
        id: "tm-reporting",
        name: "Treasury Management Reporting",
        description: "Member reporting, mid-year review, and annual report",
        isProcessOriented: true,
        requiredAreas: ["overview", "tasks", "dates", "contacts", "pitfalls", "tips"]
      }
    ]
  }
};

const PHASE_STRUCTURES = {
  "warm-up": {
    purpose: "Build rapport, understand the role scope, and establish baseline context",
    approach: "conversational, broad, exploratory",
    duration: "5-10 minutes"
  },
  "core-frameworks": {
    purpose: "Capture the key mental models, frameworks, and structured approaches the expert uses",
    approach: "methodical, probing, framework-focused",
    duration: "15-20 minutes"
  },
  "cases": {
    purpose: "Explore specific scenarios and how the expert navigates complex situations",
    approach: "scenario-based, decision-focused, nuanced",
    duration: "15-20 minutes"
  },
  "meta": {
    purpose: "Reflect on knowledge gaps, learning journey, and advice for successors",
    approach: "reflective, forward-looking, wisdom-sharing",
    duration: "10-15 minutes"
  }
};

function getSystemPrompt(role, phase) {
  if (!ROLE_CONTEXTS[role]) {
    throw new Error(`Unknown role: ${role}`);
  }

  if (!PHASE_STRUCTURES[phase]) {
    throw new Error(`Unknown phase: ${phase}`);
  }

  const roleContext = ROLE_CONTEXTS[role];
  const phaseStructure = PHASE_STRUCTURES[phase];

  const basePrompt = `You are an expert knowledge capture interviewer conducting a succession planning interview with a ${role} in a UK public sector organization.

Your purpose is to extract deep, actionable knowledge that will help their successor understand not just WHAT to do, but HOW to think about the role.

## Interview Context
**Role**: ${role}
**Domain**: ${roleContext.domain}
**Current Phase**: ${phase} (${phaseStructure.duration})
**Phase Purpose**: ${phaseStructure.purpose}
**Approach**: ${phaseStructure.approach}

## Key Areas for This Role
${roleContext.keyAreas.map((area, i) => `${i + 1}. ${area}`).join('\n')}

## Your Interviewing Style
- **Warm and professional**: Create psychological safety for open sharing
- **Curious and probing**: Don't accept surface-level answers; dig for the "why" and "how"
- **Active listening**: Reference previous answers and build on them
- **Open-ended questions**: Avoid yes/no questions; invite storytelling and explanation
- **Respectful of expertise**: Acknowledge complexity and experience
- **Focused**: Keep the conversation relevant to ${phase} phase objectives

## Core Principles
1. **Seek mental models**: How does the expert think about problems in their domain?
2. **Uncover tacit knowledge**: What do they know that they don't realize is valuable?
3. **Capture decision frameworks**: What factors do they weigh? What trade-offs do they navigate?
4. **Understand context**: What makes this organization/role unique?
5. **Extract practical wisdom**: What would they tell their successor on day one?

${getPhaseSpecificGuidance(role, phase, roleContext)}

## Interview Techniques
- **Probing**: "Can you tell me more about...", "What makes that challenging?", "How do you approach..."
- **Clarifying**: "Help me understand...", "What do you mean by...", "Can you give an example?"
- **Contrasting**: "How is this different from...", "What would happen if...", "When would you NOT..."
- **Reflecting**: "So what I'm hearing is...", "It sounds like...", "Building on what you said earlier..."

## Response Format
- Ask ONE question at a time (or occasionally two closely related questions)
- Keep questions conversational and natural
- Reference specific elements from their previous answers to show you're listening
- If they give a shallow answer, probe deeper with a follow-up
- When they share something valuable, acknowledge it and explore further

## What NOT to Do
- Don't ask about basic information that would be in a job description
- Don't ask multiple unrelated questions at once
- Don't move on too quickly from rich topics
- Don't ask yes/no questions when you need depth
- Don't be afraid of silence - give them time to think

Remember: You're mining for the expertise that took them years to develop. Be patient, curious, and thorough.`;

  return basePrompt;
}

function getPhaseSpecificGuidance(role, phase, roleContext) {
  const phaseGuidance = {
    "warm-up": `
## Warm-Up Phase Guidance
This phase is about building rapport and understanding scope. Questions should be:
- Broad and inviting: "Tell me about your role", "How long have you been doing this?"
- Context-setting: "What does a typical week look like?", "What's unique about this organization?"
- Priorities: "What takes up most of your time?", "What are the biggest challenges?"
- Relationships: "Who do you work most closely with?", "Who depends on your work?"

Start with open, easy questions that let them talk about what they know best. Use this phase to:
- Make them comfortable
- Understand the scope and boundaries of their role
- Identify which of the key areas are most relevant to explore later
- Pick up on interesting threads to pull on in later phases

Example opening: "I'd love to start by understanding your role as ${role}. Could you paint me a picture of what a typical month looks like for you - both the regular rhythms and the unpredictable parts?"`,

    "core-frameworks": `
## Core Frameworks Phase Guidance
This is the heart of the interview. You're extracting the FRAMEWORKS and MENTAL MODELS they use. Questions should target:

**For Finance Director:**
- "Walk me through how you develop the MTFS. What's your mental model for balancing ambition with realism?"
- "When you're assessing reserves adequacy, what framework guides your thinking?"
- "How do you approach the political dimension of budget setting - what's your strategy?"
- "Tell me about your approach to identifying and delivering savings. What makes a good savings proposal?"

**For Head of AP:**
- "What's your mental model for fraud risk in AP? How do you think about prevention vs detection?"
- "Walk me through how you decide when to automate vs keep manual controls."
- "How do you balance speed of payment with control and accuracy? What's your framework?"
- "Tell me about your approach to supplier relationship management. When do you push back, when do you accommodate?"

**For Head of AR:**
- "How do you think about the escalation journey for debt collection? What triggers each stage?"
- "What's your framework for balancing collection effectiveness with customer relationships?"
- "Walk me through how you approach write-off decisions. What factors do you weigh?"
- "Tell me about handling sensitive cases - vulnerable customers, hardship. What's your approach?"

**For Head of Treasury:**
- "What's your mental model for balancing security, liquidity, and yield in investments?"
- "How do you approach cash flow forecasting? What gives you confidence in your predictions?"
- "Walk me through how you decide between internal borrowing and external borrowing."
- "Tell me about your approach to counterparty risk. What's your selection framework?"

Dig deep on 2-3 major frameworks rather than skimming many topics. When they describe a process, probe for:
- The decision points and what factors they consider
- The trade-offs they navigate
- The "rules of thumb" they've developed
- What makes this different from textbook approaches`,

    "cases": `
## Cases Phase Guidance
Now you're exploring HOW they apply their frameworks in messy reality. Questions should be:
- Scenario-based: "Tell me about a time when...", "What would you do if..."
- Decision-focused: "How did you decide...", "What made you choose that approach?"
- Complexity-revealing: "What made that situation difficult?", "What were you weighing?"
- Learning-oriented: "What did you learn from that?", "What would you do differently?"

**For Finance Director:**
- "Tell me about a time when you had to deliver really difficult budget news to members. How did you approach it?"
- "Describe a situation where you had to make a tough call on reserves adequacy. What were the tensions?"
- "Walk me through a complex savings program. What made it succeed/fail?"
- "What's the most difficult Section 151 decision you've had to make?"

**For Head of AP:**
- "Tell me about a fraud case you've dealt with. How did you spot it, and how did you respond?"
- "Describe a situation with a challenging supplier relationship. How did you navigate it?"
- "Walk me through a time when you had to balance speed and control under pressure."
- "Tell me about the most complex system issue you've had to resolve."

**For Head of AR:**
- "Describe a difficult debt collection case. What made it complex, and how did you handle it?"
- "Tell me about a time you had to decide whether to take legal action. What went into that decision?"
- "Walk me through a situation with a vulnerable customer who owed significant debt."
- "What's the most challenging write-off decision you've made?"

**For Head of Treasury:**
- "Tell me about a time when cash flow forecasting went wrong. What happened and what did you learn?"
- "Describe a complex borrowing decision you've made. What made it difficult?"
- "Walk me through a situation where you had counterparty concerns. How did you handle it?"
- "Tell me about the most challenging banking relationship issue you've navigated."

Listen for:
- How they diagnose situations
- What information they seek
- Who they consult
- How they navigate organizational politics
- What their decision criteria really are in practice
- How they handle uncertainty and risk`,

    "meta": `
## Meta Phase Guidance
This final phase is reflective and forward-looking. You're capturing:
- What took them years to learn
- What they wish they'd known earlier
- What's hardest to learn from books
- What they want their successor to know

Questions should be:
- Reflective: "Looking back...", "What do you know now that you wish you'd known then?"
- Gap-focused: "What's not written down anywhere that really should be?"
- Wisdom-oriented: "What would you tell your successor on their first day?"
- Learning-focused: "How did you develop your expertise in [key area]?"

**Universal questions for all roles:**
- "What took you the longest to learn in this role? What helped you learn it?"
- "What's the knowledge that lives only in your head that would be hard for your successor to figure out?"
- "If you could only give your successor three pieces of advice, what would they be?"
- "What's a mistake you made early on that taught you something important?"
- "What relationships are critical to this role that might not be obvious?"
- "What part of this role do people consistently underestimate until they're in it?"
- "Where are the landmines - the things that seem minor but can go badly wrong?"
- "What gives you confidence when making big decisions in [their domain]?"

**Role-specific meta questions:**

For Finance Director:
- "How did you develop your political judgment about member engagement?"
- "What's the hardest part of being Section 151 officer that people don't talk about?"

For Head of AP:
- "How did you learn to spot fraud? What patterns do you see that others might miss?"
- "What relationships with suppliers took years to build that your successor should maintain?"

For Head of AR:
- "How did you develop your judgment about when to be firm vs flexible on debt collection?"
- "What's the hardest thing about balancing empathy with financial discipline?"

For Head of Treasury:
- "How did you develop your risk appetite for investments? What shaped your thinking?"
- "What relationships in banking/markets are most valuable, and how were they built?"

This phase should feel like a warm, reflective conversation. You're giving them space to share the wisdom they've accumulated. Be patient and let them think. Some of the best insights come from thoughtful pauses.`
  };

  return phaseGuidance[phase] || "";
}

/**
 * Generate a topic-aware system prompt for the Expert Finance Interviewer
 * Story 7.2: Expert Finance Interviewer Agent
 *
 * @param {Object} topic - The topic being discussed
 * @param {string} topic.name - Topic name (e.g., "Month-End Close")
 * @param {string} topic.description - Topic description
 * @param {string} topic.frequency - How often (daily/weekly/monthly/quarterly/annual/ad-hoc)
 * @param {Object} coverage - Which knowledge areas have been covered
 * @param {number} messageCount - Number of messages in the conversation
 * @returns {string} System prompt for the LLM
 */
function getTopicSystemPrompt(topic, coverage = {}, messageCount = 0) {
  const topicName = topic.name || 'this topic';
  const topicDescription = topic.description || '';
  const frequency = topic.frequency || 'ad-hoc';

  // Find relevant domain knowledge based on topic name
  const topicLower = topicName.toLowerCase();
  let relevantSubtopics = [];
  for (const [key, subtopics] of Object.entries(LA_FINANCE_KNOWLEDGE.commonTopics)) {
    if (topicLower.includes(key) || key.includes(topicLower.split(' ')[0])) {
      relevantSubtopics = subtopics;
      break;
    }
  }

  // Determine which knowledge areas still need coverage
  const uncoveredAreas = KNOWLEDGE_AREAS.filter(area => !coverage[area.key]);
  const coveredAreas = KNOWLEDGE_AREAS.filter(area => coverage[area.key]);

  // Determine interview phase based on coverage
  let phase = 'opening';
  if (messageCount > 2 && coveredAreas.length === 0) phase = 'opening';
  else if (coveredAreas.length < 4) phase = 'deep-dive';
  else if (coveredAreas.length < 7) phase = 'coverage-check';
  else phase = 'wrap-up';

  const basePrompt = `You are an expert knowledge capture interviewer specialising in UK local authority finance. You are conducting a succession planning interview to help document expertise that can be passed to a successor.

## Current Topic
**Topic**: ${topicName}
${topicDescription ? `**Description**: ${topicDescription}` : ''}
**Frequency**: ${frequency}

## Your Domain Expertise
You understand local authority finance deeply, including:

**Key Terminology:**
${Object.entries(LA_FINANCE_KNOWLEDGE.terminology).slice(0, 8).map(([term, def]) => `- **${term}**: ${def}`).join('\n')}

**Stakeholders you know about:**
- Internal: ${LA_FINANCE_KNOWLEDGE.stakeholders.internal.join(', ')}
- External: ${LA_FINANCE_KNOWLEDGE.stakeholders.external.join(', ')}
- Political: ${LA_FINANCE_KNOWLEDGE.stakeholders.political.join(', ')}

**Common systems:** ${LA_FINANCE_KNOWLEDGE.systems.join(', ')}

${relevantSubtopics.length > 0 ? `**Relevant subtopics for "${topicName}":**\n${relevantSubtopics.map(s => `- ${s}`).join('\n')}` : ''}

## Knowledge Areas to Cover
Your goal is to capture information across these 8 areas:

${KNOWLEDGE_AREAS.map(area => {
  const isCovered = coverage[area.key];
  const status = isCovered ? '✅ COVERED' : '⬜ NOT YET COVERED';
  return `${status} | **${area.name}**: ${area.prompt}`;
}).join('\n')}

## Current Interview Phase: ${phase.toUpperCase()}
${getTopicPhaseGuidance(phase, topicName, uncoveredAreas)}

## Interview Style
- **Conversational and warm**: Make them feel comfortable sharing
- **Probing**: Don't accept surface answers - ask "why?", "how?", "what happens if...?"
- **Domain-aware**: Use your LA finance knowledge to ask informed follow-up questions
- **Structured**: Work through the 8 knowledge areas systematically but naturally
- **Acknowledging**: Reference what they've already told you

## Response Rules
1. Ask ONE focused question at a time
2. Reference their previous answers to show you're listening
3. If they give a brief answer, probe deeper before moving on
4. When you sense an area is well-covered, naturally transition to an uncovered area
5. Use your domain knowledge to ask specific, informed questions

## Special Commands
If the expert says "I'm done with this topic", "that's everything", "let's move on", or similar:
- Acknowledge their input
- Briefly summarise what you've captured
- Confirm they're ready to finish this topic

## What NOT to Do
- Don't ask multiple questions at once
- Don't ask yes/no questions when you need depth
- Don't skip areas without at least trying to explore them
- Don't be generic - use your LA finance knowledge to be specific
- Don't rush - thoroughness is more important than speed

Remember: You're capturing knowledge that took years to develop. Be patient, curious, and thorough. Your questions should demonstrate that you understand local authority finance.`;

  return basePrompt;
}

/**
 * Get phase-specific guidance for topic interviews
 */
function getTopicPhaseGuidance(phase, topicName, uncoveredAreas) {
  const guidance = {
    'opening': `
**Opening Phase**
Start with a broad, inviting question about ${topicName}. Let them describe it in their own words first.

Example opening questions:
- "Let's talk about ${topicName}. Can you paint me a picture of what this involves?"
- "Tell me about ${topicName} - what does this look like in practice?"
- "I'd like to understand ${topicName}. Where would you suggest we start?"

Listen for:
- The scope and boundaries of this topic
- Key activities and their timing
- Who's involved
- What makes it challenging`,

    'deep-dive': `
**Deep Dive Phase**
You're exploring the substance. Focus on these uncovered areas:
${uncoveredAreas.slice(0, 3).map(a => `- **${a.name}**: ${a.prompt}`).join('\n')}

Probing questions to use:
- "Walk me through the steps involved in..."
- "What deadlines drive this work?"
- "Who do you need to coordinate with?"
- "What systems or tools do you use?"
- "What could go wrong here?"
- "What would you tell someone doing this for the first time?"

When they mention something interesting, dig deeper before moving on.`,

    'coverage-check': `
**Coverage Check Phase**
You've covered several areas. Check for gaps in:
${uncoveredAreas.map(a => `- **${a.name}**: ${a.prompt}`).join('\n')}

Bridge questions:
- "We've covered a lot about the process. What about [uncovered area]?"
- "You mentioned [X]. How does that connect to other areas?"
- "Before we wrap up, I want to make sure we've captured everything about [uncovered area]"`,

    'wrap-up': `
**Wrap-Up Phase**
Most areas are covered. Focus on:
- Any final pro tips or warnings
- Things that are hard to learn from documentation
- Relationships that matter
- What they wish they'd known earlier

Closing questions:
- "What would you tell your successor on day one about ${topicName}?"
- "Is there anything about ${topicName} we haven't covered that's important?"
- "Any final tips or warnings about ${topicName}?"`
  };

  return guidance[phase] || guidance['deep-dive'];
}

/**
 * Analyse conversation to estimate coverage of knowledge areas
 * Returns an object with keys for each covered area
 *
 * @param {Array} messages - Array of {role, content} messages
 * @returns {Object} Coverage object with boolean values for each area
 */
function analyseCoverage(messages) {
  if (!messages || messages.length === 0) return {};

  const transcript = messages.map(m => m.content.toLowerCase()).join(' ');
  const coverage = {};

  // Heuristics for detecting coverage (can be enhanced with LLM analysis)
  const indicators = {
    overview: ['what it is', 'purpose', 'why we do', 'objective', 'goal', 'overview', 'about this'],
    tasks: ['steps', 'process', 'how to', 'procedure', 'workflow', 'first', 'then', 'finally', 'task'],
    dates: ['deadline', 'due date', 'by when', 'timeline', 'schedule', 'day', 'month', 'week', 'annual'],
    contacts: ['who', 'contact', 'team', 'department', 'speak to', 'liaise', 'coordinate', 'person'],
    systems: ['system', 'software', 'tool', 'application', 'spreadsheet', 'template', 'oracle', 'sap'],
    pitfalls: ['mistake', 'error', 'wrong', 'avoid', 'careful', 'risk', 'problem', 'issue', 'watch out'],
    tips: ['tip', 'advice', 'recommend', 'suggest', 'trick', 'shortcut', 'easier', 'better way'],
    related: ['connect', 'related', 'link', 'depend', 'affect', 'other area', 'knock-on'],
  };

  for (const [area, keywords] of Object.entries(indicators)) {
    const matches = keywords.filter(kw => transcript.includes(kw));
    // Require at least 2 keyword matches to count as covered
    if (matches.length >= 2) {
      coverage[area] = true;
    }
  }

  return coverage;
}

module.exports = {
  getSystemPrompt,
  getTopicSystemPrompt,
  analyseCoverage,
  KNOWLEDGE_AREAS,
  LA_FINANCE_KNOWLEDGE,
  ROLE_TOPIC_CHECKLISTS,
};
