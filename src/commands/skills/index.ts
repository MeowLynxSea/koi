/**
 * Skills Command Entry Point
 *
 * Registers the /skills command for the command palette.
 */

import type { Command } from "../../types/commands.js";

const skillsCommand: Command = {
  id: "skills",
  name: "Skills",
  description: "List and manage available skills",
  keywords: ["skill", "skills", "commands", "slash"],
  action: async (context) => {
    // This will be handled by the app's command panel
    if (context.onOpenSkillsModal) {
      context.onOpenSkillsModal();
    }
    return { success: true };
  },
};

export default skillsCommand;
