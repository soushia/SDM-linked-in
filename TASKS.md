# Proposed Tasks

## Fix a typo
- **Issue**: The profile uses two different capitalizations for "E‑commerce" (badge uses "E‑commerce" while the Whole Foods experience entry uses "E‑Commerce"), which reads like a casing typo in the resume copy. 【F:linked_in_style_personal_site_git_hub_friendly.html†L124-L126】【F:linked_in_style_personal_site_git_hub_friendly.html†L189-L191】
- **Task**: Normalize the capitalization so the spelling of "E‑commerce" is consistent across the page.

## Fix a bug
- **Issue**: Accessing `localStorage` without a safety check throws in Safari private mode or other restricted environments, breaking all subsequent scripts on the page. 【F:linked_in_style_personal_site_git_hub_friendly.html†L300-L319】
- **Task**: Guard the endorsement counter logic with try/catch (or feature detection) so the UI keeps working even when `localStorage` is unavailable.

## Fix a documentation discrepancy
- **Issue**: The comment claims the contact form has a "graceful fallback", but the inline `onsubmit="return false"` prevents the form from submitting anywhere if JavaScript is disabled. 【F:linked_in_style_personal_site_git_hub_friendly.html†L261-L268】【F:linked_in_style_personal_site_git_hub_friendly.html†L335-L349】
- **Task**: Update the markup/JS so the fallback description is accurate (e.g., drop the inline return false and prevent submission from the script instead).

## Improve a test
- **Issue**: There is no automated test covering the project loader; if `/api/projects` fails the page silently falls back, but this behavior isn't verified. 【F:linked_in_style_personal_site_git_hub_friendly.html†L351-L371】
- **Task**: Add a front-end test (e.g., Jest + jsdom) that simulates a failed fetch and asserts the default project cards render.
