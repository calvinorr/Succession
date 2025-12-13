# Interview Session Interface - Component Guide

## Interface Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ HEADER                                                                  │
│ [Logo] Succession | Session with Dr. Sarah Bennett                     │
│            [🔴 REC  04:32]            Auto-saved ✓  [End Session]      │
└─────────────────────────────────────────────────────────────────────────┘
┌──────────────────┬──────────────────────────────────────────────────────┐
│ LEFT SIDEBAR     │ MAIN CONTENT AREA                                    │
│                  │                                                       │
│ INTERVIEW        │ ┌────────────────────────────────────────────────┐  │
│ STRUCTURE        │ │ CURRENT QUESTION CARD                          │  │
│                  │ │                                                 │  │
│ ✓ Intro & Setup │ │ [Question 3 of 8] • Bottlenecks              │  │
│ ✓ Core Framework│ │                                                 │  │
│ ▶ Bottlenecks   │ │ Can you describe the biggest bottleneck        │  │
│   Focus on...   │ │ in your current workflow?                       │  │
│ 4 Ideal State   │ │                                                 │  │
│ 5 Closing       │ │ 💡 Ask about specific tools                    │  │
│                  │ │ ⏰ Ask about time wasted on legacy API         │  │
│                  │ │                               [✓ Mark Covered] │  │
│                  │ └────────────────────────────────────────────────┘  │
│                  │                                                       │
│                  │ ┌────────────────────────────────────────────────┐  │
│                  │ │ RICH TEXT TOOLBAR                               │  │
│                  │ │ [B] [I] | [•] [1.] | [#insight] [#quote]      │  │
│                  │ ├────────────────────────────────────────────────┤  │
│                  │ │ NOTES EDITOR                                    │  │
│                  │ │                                                 │  │
│                  │ │ She mentioned that the legacy API is the       │  │
│                  │ │ main issue. It adds 4 hours to the weekly     │  │
│                  │ │ reporting cycle...                             │  │
│                  │ │                                                 │  │
│                  │ │ #quote "We spend more time fixing the data     │  │
│                  │ │ format than analyzing it."                     │  │
│ ┌──────────────┐ │ │                                                 │  │
│ │ 🎯 INTERVIEW │ │ │                                                 │  │
│ │    GOALS     │ │ │                                                 │  │
│ │              │ │ │                                                 │  │
│ │ • Capture    │ │ ├────────────────────────────────────────────────┤  │
│ │   knowledge  │ │ │ Markdown supported               72 words      │  │
│ │ • Build      │ │ └────────────────────────────────────────────────┘  │
│ │   support    │ │                                                       │
│ └──────────────┘ │ [← Previous]  [🔖 Bookmark] [Next Question → ⌘↵]  │
│                  │                                                       │
└──────────────────┴──────────────────────────────────────────────────────┘
```

## Component Breakdown

### 1. Top Header Bar (Fixed)
```
┌────────────────────────────────────────────────────────────┐
│ [Logo] Succession | Session with Expert Name               │
│                 [🔴 REC  MM:SS]                            │
│                         Auto-saved ✓    [End Session]      │
└────────────────────────────────────────────────────────────┘
```

**Elements:**
- **Left**: App logo + "Succession" branding + expert name
- **Center**: Recording indicator (pulsing red dot) + live timer
- **Right**: Auto-save status + End Session button (red)

### 2. Left Sidebar (Scrollable)
```
┌──────────────────┐
│ INTERVIEW        │
│ STRUCTURE        │
│                  │
│ ✓ Phase 1        │ ← Completed (green checkmark)
│   (strikethrough)│
│                  │
│ ▶ Phase 2        │ ← Active (blue, play icon, description)
│   Description    │
│                  │
│ 3 Phase 3        │ ← Pending (gray, number)
│                  │
├──────────────────┤
│ 🎯 GOALS         │ ← Sticky footer section
│ • Objective 1    │
│ • Objective 2    │
└──────────────────┘
```

**Five Phases:**
1. Intro & Setup (warm-up)
2. Core Frameworks
3. Cases & Scenarios
4. Reflection & Wisdom
5. Complete

### 3. Question Card (Top of Main Area)
```
┌─────────────────────────────────────────────────┐
│ [Question N of M] • Phase Name          [✓ Mark]│
│                                                  │
│ Large Question Text Here                        │
│                                                  │
│ 💡 Follow-up chip   ⏰ Another follow-up chip   │
└─────────────────────────────────────────────────┘
```

**Features:**
- Blue-tinted background (brand-50/50)
- Blue left border accent
- Question badge with phase indicator
- Large 2xl heading for question
- Interactive follow-up suggestion chips
- Mark Covered checkbox (top-right)

### 4. Notes Editor (Main Area)
```
┌─────────────────────────────────────────────────┐
│ [B] [I] | [•] [1.] | [#insight] [#quote]       │ ← Toolbar
├─────────────────────────────────────────────────┤
│                                                  │
│ (Rich text editing area - contenteditable)      │
│                                                  │
│ Text can be formatted with bold, italic, lists. │
│                                                  │
│ #insight Tags appear as colored badges          │
│ #quote  Like this                               │
│                                                  │
├─────────────────────────────────────────────────┤
│ Markdown supported                    72 words  │ ← Status bar
└─────────────────────────────────────────────────┘
```

**Toolbar Buttons:**
- **B**: Bold
- **I**: Italic
- **•**: Bullet list
- **1.**: Numbered list
- **#insight**: Insert blue insight tag
- **#quote**: Insert orange quote tag

### 5. Bottom Navigation
```
┌─────────────────────────────────────────────────┐
│ [← Previous]        [🔖 Bookmark]  [Next → ⌘↵] │
└─────────────────────────────────────────────────┘
```

**Buttons:**
- **Previous**: Gray, hover state, disabled when at first question
- **Bookmark**: Icon + text, shows feedback when clicked
- **Next**: Primary blue gradient, shadow, keyboard hint

## Color Coding

### Status Indicators
- **🔴 Red**: Recording indicator (pulsing animation)
- **✓ Green**: Completed phases, auto-save checkmark
- **▶ Blue**: Active phase, primary actions
- **⚪ Gray**: Pending phases, disabled states

### Tags in Notes
- **#insight**: Blue background (#eef4ff), blue text (#1a44f5)
- **#quote**: Orange background (#fff7ed), orange text (#c2410c)

## Interactive Elements

### Hover States
1. **Phase Timeline Items**: Opacity change, cursor pointer
2. **Follow-up Chips**: Border color change, background tint
3. **Toolbar Buttons**: Background color change
4. **Navigation Buttons**: Shadow enhancement, slight lift

### Click Actions
1. **Phase Timeline**: Jump to that phase (if implemented)
2. **Follow-up Chips**: Could insert suggested text
3. **Mark Covered**: Toggle checkbox state
4. **Toolbar Buttons**: Apply formatting or insert tags
5. **Bookmark**: Record timestamp, show feedback
6. **Next/Previous**: Navigate through questions
7. **End Session**: Save and exit

## Typography Scale

```
- Timer: 16px mono (base)
- Status text: 12px (xs)
- Phase labels: 14px (sm)
- Question badge: 12px bold uppercase (xs)
- Question text: 24px bold (2xl)
- Follow-ups: 14px (sm)
- Notes editor: 16px (base)
- Word count: 12px (xs)
```

## Spacing & Layout

### Grid Structure
```
Sidebar: 288px fixed (18rem)
Main: flex-1 (remaining space)
Header: 64px fixed (h-16)
```

### Padding
- Header: px-6 (24px horizontal)
- Sidebar: p-5 (20px all sides)
- Question card: p-6 (24px all sides)
- Notes editor: p-6 (24px all sides)
- Navigation: p-6 (24px all sides)

### Gaps
- Header items: gap-4 (16px)
- Phase timeline: mb-6 (24px between items)
- Follow-up chips: gap-2 (8px)
- Toolbar buttons: gap-1 (4px)

## Responsive Behavior

### Desktop (Default)
- Full sidebar visible (288px)
- Question card horizontal layout
- Keyboard shortcuts visible
- All features accessible

### Tablet (md breakpoint)
- Sidebar could collapse to icons
- Question card stacks vertically
- Reduced padding

### Mobile (sm breakpoint)
- Sidebar becomes overlay/drawer
- Single column layout
- Touch-optimized targets
- Simplified toolbar

## Animations

### Recording Indicator
```css
@keyframes recording-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
Duration: 2s ease-in-out infinite
```

### Button Hover
```css
transform: translateY(-0.5px);
shadow: enhanced
transition: all 200ms
```

### Auto-save Feedback
- Text color change to green
- Icon swap to checkmark
- 2-second timeout to revert

### Bookmark Feedback
- Icon fills
- Text changes to "Bookmarked!"
- 2-second timeout to revert

## Accessibility Considerations

### Keyboard Navigation
- ⌘/Ctrl + Enter: Next question
- Tab: Navigate through interactive elements
- Space/Enter: Activate buttons
- Arrow keys: (Future) Navigate timeline

### Screen Reader Labels
- "Session with [Expert Name]"
- "Recording in progress"
- "Elapsed time: N minutes, N seconds"
- "Phase N: [Phase Name], [Status]"
- "Question N of M"
- "Mark question as covered"

### Focus States
- Visible outline on keyboard focus
- Skip to main content link
- Logical tab order

## Performance Optimizations

### Auto-save Throttling
- Save every 30 seconds (not on every keystroke)
- Use localStorage for instant recovery
- Background sync to server (future)

### Timer Efficiency
- setInterval with 1-second updates
- Cleanup on unmount

### Lazy Loading
- Questions loaded per phase
- Follow-ups generated on demand
- Previous notes loaded from cache

---

**Reference**: Based on design mockup at `/docs/Screendesign/stitch_interview_setup (2)/screen.png`
