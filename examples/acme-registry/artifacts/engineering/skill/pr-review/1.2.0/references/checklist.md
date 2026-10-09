# Review checklist

- Does the change match the pull request description?
- Are error paths handled, and are the errors generic to callers?
- Is any input from outside the process validated before use?
- Are queries parameterised?
- Do new tests fail without the change and pass with it?
- Is anything logged that should not be?
