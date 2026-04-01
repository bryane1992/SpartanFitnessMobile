---
name: UI and style feedback
description: Feedback on UI sizing, equipment granularity, multi-select preferences, no emojis
type: feedback
---

- **NO EMOJIS** anywhere in the UI or code. No emoji icons, labels, buttons, headers, or data.
  **Why:** User explicitly does not want emojis.
  **How to apply:** Never add emoji characters to any file. Use plain text, unicode symbols (arrows, dots), or styled views instead.

- Buttons should not be oversized — keep padding reasonable (16px not 18px), don't add excessive marginTop.
  **Why:** First onboarding screen had a huge next button that looked bad.
  **How to apply:** Keep button sizing compact and consistent across screens.

- Equipment selection should list specific items (dumbbells, squat rack, bench, etc.) not broad categories like "Full Gym".
  **Why:** Users want to specify exactly what they have.
  **How to apply:** Use granular equipment options in onboarding and exercise filtering.

- Workout style should be multi-select (e.g., CrossFit + Traditional together), not single choice.
  **Why:** Users often train a mix of styles.
  **How to apply:** Use array for workoutStyles, merge exercise pools from all selected styles.

- Bryan wants the mobile app workout display to match his web app. Need to see web app screenshots to match the design.
  **Why:** Consistency between web and mobile versions.
  **How to apply:** Ask for screenshots when redesigning workout display.
