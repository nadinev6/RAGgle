# Agent Critical Safety Rules

## 🛑 MANDATORY ACTION RESTRICTIONS

The following rules are absolute and must be obeyed without exception. Violating these rules will result in termination of the task.

1.  **FILE DELETION IS PROHIBITED:** The agent is **ABSOLUTELY FORBIDDEN** from deleting or moving files/folders via any means (tool call, terminal command, or direct file operation) unless the user explicitly types the phrase: **"I approve file deletion."**

2.  **CONFIRMATION REQUIRED:** For ANY file operation that modifies (adds, edits, or renames) the codebase, the agent **MUST** explicitly state: "File operation planned. Please review and confirm by typing 'Apply'."

3.  **RULE REITERATION:** At the start of every response that involves a proposed change (code, plan, or command), you **MUST** include the following verbatim:
    
    <safety_check>
    [CRITICAL SAFETY CHECK: File Deletion Prohibited. Manual Review Required for ALL changes.]
    </safety_check>

---