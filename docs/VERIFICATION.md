# Module 1 verification record

## Scope and source inspection

Inspected repository base: `ff21ae16df6e15c9828e9ebf16c2020cd8830a1e` on `main`. It contained only a placeholder `index.html` and a two-line README. No existing module implementations or teammate code were changed.

Requirements were read from all four pages of **ENCS4380 Homework 1: Dynamic Characteristics Interactive Toolkit**, released 29 October 2026. Module 1, section 3.2 validation check 1, technical rules, and assistance-disclosure rules informed this implementation. The supplied **Static and Dynamic Characteristics** lecture was inspected, including slide 34's closed-form first-order step and ramp equations. Supplied course files were treated as read-only references and are not copied into the repository.

The existing GitHub Pages configuration serves `main` from the repository root at https://dana-dawadi.github.io/encs4380-dynamics-klombo/. This branch has not been merged or deployed. These results verify the branch locally under a repository-prefixed URL, not the current public site.

## Requirement coverage

| Requirement | Implementation | Verification |
| --- | --- | --- |
| Static site without server-side computation, login, or CDN | Relative ES module and stylesheet paths in `index.html`; all calculations run in the browser | Browser loads all assets under `/encs4380-dynamics-klombo/` without resource or JavaScript errors |
| Adjustable K and τ; step and ramp inputs | `modules/module1/index.js`, labelled waveform and range controls | Browser changes gain, amplitude, τ, and waveform and checks immediate displayed results |
| Closed-form first-order responses | Pure `step` and `ramp` in `modules/module1/math.js` | Math checks initial values, gain scaling, step limits, numerical ramp ODE residual, ramp asymptote, and near-zero ramp stability |
| 63.2% at τ and approximately 95% at 3τ | Step markers, numeric metric cards, and explanatory exact 95% time | Independent browser marker-coordinate checks and math landmark tests over multiple K and τ values |
| Ramp lag τ and steady dynamic error Krτ | Ramp metrics and horizontal asymptotic lag guide | Browser checks lag/error text and guide; math verifies large-time error tends to Krτ |
| Correct interpretation for K ≠ 1 | Separate raw input x, ideal Kx, and sensor curves; explanation of x − y | Browser checks non-unit-gain ramp metrics and the raw-input-error distinction |
| Error-fraction logarithmic plot | Log-spaced fraction axis; natural and base-10 choices | Math checks both slopes; browser checks base-10 conversion and natural-log slope after τ changes |
| Predict, then check | A required guess followed by an actual doubled-τ change and explanatory feedback | Browser checks empty guess, correct/incorrect feedback, and rejection of doubling beyond the allowed range |
| Visible expected/actual/pass validation | `validate()` and semantic validation table | Both rounded lecture values pass within the displayed ±0.0005 fraction tolerance |
| Phone layout and keyboard access | Responsive charts, labelled native controls, focus styling, skip link, textual metric equivalents | Desktop and phone-width visual inspection, overflow checks, and keyboard interaction |
| Team integration | Isolated Module 1 folder, scoped module CSS, separate shared shell CSS, `mount(root)` cleanup | Browser checks two simultaneous instances have unique IDs, isolated controls, and successful cleanup |
| README and screenshots | Project README and `docs/screenshots/` | Local desktop and mobile screenshots generated from the tested branch |

## Executed checks

- `npm test`: **4 tests passed, 0 failed** using Node.js v24.14.0. Each test exercises multiple parameter values where appropriate.
- `node tests/browser.mjs`: **17 checks passed** in headless Google Chrome **156.0.8078.80** through Playwright.
- Desktop viewport: **1440 × 1100**.
- Phone-size viewports: **390 × 844** and **320 × 844**, emulated in desktop Chrome. Desktop and 390-pixel screenshots were inspected; overflow assertions also covered 320 pixels.
- `node --check modules/module1/index.js`: passed.
- `git diff --check`: passed before final handoff.

The browser test script records individual assertions and generates the screenshot assets. The math tests use independent expected values and a numerical derivative for the ramp differential-equation residual rather than relying only on the implementation's own validation output.

## Limits

No physical phone, Safari, or Firefox was tested. Browser accessibility checks cover labelled controls, keyboard use, and visible/textual equivalents; they are not a full screen-reader audit. The responsive horizontal time window follows 0–6τ, which is explicitly explained on the page. The log-error chart is the reference **step** error even when the response selector shows a ramp. Modules 2–4 and their validation checks are outside this change. No merge, public deployment, or final `v1.0` release is claimed.

# Module 2 verification record

| Requirement | Implementation | Verification |
| --- | --- | --- |
| Adjustable τ and input frequency | Log-scale sliders and exact lecture presets in `modules/module2/index.js` | Browser checks slider changes redraw metrics and cutoff immediately |
| Input and output sines on one plot | Steady-state output, optional start-up transient, M line and Δt marker | Math test checks the ODE residual and settling to M sin(ωt + φ); browser checks the transient toggle |
| Amplitude ratio and phase lag | `amplitudeRatio`, `phase`, `timeDelay` in `modules/module2/math.js` | Math tests at the cutoff (1/√2, −3 dB, −45°) and high-frequency slope (−20 dB/decade) |
| Bode plot with cutoff at ω = 1/τ | Log-frequency magnitude and phase charts with asymptotes, cutoff line and current point | Browser checks cutoff text follows τ; extreme values give finite paths |
| Dynamic-error calculator (δ = M − 1) | τmax from allowed error and highest frequency, with working shown | Math test checks M = 1 − e exactly at τmax; browser checks 0.523 ms / 9.3°, 50% accepted and 50.1% rejected, and out-of-range results (1000 Hz → 0.0523 ms) cannot be loaded |
| Predict, then check | Doubles f after a required guess and reports the change in M, phase angle and time delay | Math test: angle rises and delay falls when f doubles (143 ms → 94.9 ms at τ = 0.2 s); browser checks feedback text and the 1000 Hz limit |
| Validation checks 2 and 3 | `validate()` and validation table | All four values pass: M = 0.9285, 21.801°, τmax = 0.5231 ms, 9.333° |
| Navigation | Hash router in `index.html`; cleanup before each mount; skip link does not change module | Browser checks tab switch, direct `#module2` link, and skip link |
| Phone layout | Responsive grid and charts | No horizontal overflow at 390 and 320 px |

Executed: `npm test` (10 tests, 0 failed, Module 1 and 2), `node tests/browser.mjs` (17 checks passed, Module 1 unchanged with the router), `node tests/browser-module2.mjs` (17 checks passed), headless Chromium, Node.js v22.
