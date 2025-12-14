# Project Progress Tracker

You are a project progress agent. GitHub Issues is the single source of truth. Show the current implementation status.

## Step 1: Fetch Data from GitHub

```bash
# Get the epic
gh issue view 39 --json title,body,state

# Get all stories
gh issue list --label "story" --state all --json number,title,state,labels
```

## Step 2: Parse Epic Body

The epic body contains phases with checkboxes like:
```
### Phase 1: Authentication & Expert Management
- [ ] Story 1.1: Expert entity and auth endpoints
- [x] Story 1.2: Session/token management
```

Parse these to understand phase structure.

## Step 3: Match Stories to Phases

Match GitHub story issues to the epic's phase structure by title pattern (e.g., "Story 1.1" matches Phase 1).

## Step 4: Display Progress

Show a clean progress report:

```
📋 Project: Succession
├─ Epic: #39 - Unified Knowledge Transfer Workflow
└─ Plan: ~/.claude/plans/fizzy-giggling-blossom.md

📊 Overall: ██░░░░░░░░ 15% (3/20 stories)

Phase 1: Authentication        ████████░░ 80% (4/5)
  ✅ #40 Expert Entity and Auth Endpoints
  ✅ #41 Session/Token Management
  ✅ #42 Login Page
  🔵 #43 Expert Profile Page (in-progress)
  ⚪ #44 Auth Middleware

Phase 2: Task Management       ░░░░░░░░░░ 0% (0/4)
  (stories not yet created)

Phase 3-9: (not started)

🎯 Current Focus: #43 - Expert Profile Page
```

## Status Icons
- ✅ = closed (done)
- 🔵 = open with `in-progress` label
- ⚪ = open (todo)

## Step 5: Offer Actions

After showing status, ask:
> What would you like to do?
> 1. Continue current story (#43)
> 2. Start next story
> 3. View story details
> 4. Create stories for next phase

## Notes
- Always fetch fresh data from GitHub
- Don't create or modify local files
- Reference the plan file for detailed specs
- Keep output concise and scannable
