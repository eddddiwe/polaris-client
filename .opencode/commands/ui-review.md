---
description: Review code and UI elements without editing, then return prioritized fixes
agent: ui-reviewer
subagent: true
---

Review $ARGUMENTS.

Focus on the actual UI states and the code that drives them. Inspect the current diff and the relevant renderer pages, components, styles, IPC contracts, and state flows. If runtime rendering is available, check narrow, tablet, and desktop widths and the loading, empty, error, disabled, focus, and long-content states. If it is not available, say so explicitly.

Return the verdict, the top three improvements, findings grouped as UI and Code with severity and file:line, what you verified, and what you could not verify. Do not edit files.
