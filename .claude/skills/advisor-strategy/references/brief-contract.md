# Advisor brief contract

Prepare a concise, decision-oriented request.

- `question`: one answerable decision question, including relevant constraints.
- `kind`: one of `architecture`, `debugging`, `security`, or `review`.
- `evidence`: at most four repository-relative text files that directly support the decision.

Good: “Should the release marker be updated before or after each root promotion, given rollback requirements?” with the publisher and recovery modules.

Not suitable: “Implement the feature for me”, “Review the whole repository”, a request containing credentials, or a request intended to select a model/provider.

After receiving advice, compare it with the cited code and constraints. Prefer the least complex safe option; reject unsupported claims and document a materially different final decision.
