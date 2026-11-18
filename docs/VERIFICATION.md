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

# Control P1 verification record

| Requirement | Implementation | Verification |
| --- | --- | --- |
| Choose the plant (Module 1 first order or Module 3 second order) | Plant selector and parameter sliders in `modules/p1/index.js` | Browser: second-order preset switches the visible controls and gives 16.7% error with P only |
| Kp, Ki, Kd and setpoint step | Sliders, presets, live redraw | Browser: Ki removes the error; Kd shows the filtered-derivative note |
| Block diagram | SVG diagram with current gains, limit and plant | Browser: diagram text updates with the motor preset |
| Output against setpoint | RK4 simulation in `modules/control/sim.js`, plot with ±2% band, peak and settling markers | Unit tests compare the simulation with τ/(1 + KKp), 1/(1 + KKp) and 1 − e^(−t) |
| Control signal u with its limit | Clipped u, limit lines, time at the limit | Unit test: u never leaves [u min, u max]; browser: tight limit reports saturation and windup |
| Live rise time, overshoot, settling time, steady-state error | `metrics()` reads them from the simulated curve. Settling is measured around the final value; the status says separately whether the setpoint was reached, and when a stuck actuator makes it unreachable | Unit tests for slow, unstable and saturated loops; browser checks "Settled, but not at the setpoint", the stuck-actuator, limit-cycle and unstable messages |
| Solver required (Euler or RK4) | Fixed-step RK4, step from the fastest loop mode, at most 200 000 steps | Unit test: extreme gains stay finite |
| Validation checks 1–3 | `validate()` and the page table (6 rows) | All six rows pass in Node and on the page |
| Predict, then check | Two experiments: add I (error → 0), add D (overshoot falls) | Browser: empty guess blocked; correct and incorrect feedback with numbers |
| Phone layout | Responsive grid; narrow block-diagram layout | No horizontal overflow at 390 and 320 px |
| HW1 still works | Router extended, HW1 modules untouched | `browser.mjs` (17) and `browser-module2.mjs` (17) still pass |

Executed: `npm test` (36 tests, 0 failed), `node tests/browser-p1.mjs` (18 checks passed), headless Chromium, Node.js v22.

Limits: the motor K = 0.65 (rad/s)/% is calculated from the datasheet no-load speed, so it is a no-load value; τ = 0.06 s is an approximate estimate, not a measurement. Validation check 3 assumes a stable loop with u not stuck at a limit. The derivative is filtered with Tf = 1% of the plant time scale, so the derivative kick has a finite height. Anti-windup and sampling are left to P3; a slow sensor in the loop to P2 (the simulator already supports `sensorTau`).

# Control P2 verification record

| Requirement | Implementation | Verification |
| --- | --- | --- |
| Sensor τs (first-order sensor in the feedback path) | Log slider 0.1 ms–10 s and an ideal-sensor switch in `modules/p2/index.js`; sensor state in the shared RK4 simulator | Unit test: τs = 0 gives exactly P1's loop; browser: ideal sensor makes the two overshoots equal |
| PID gains | Kp, Ki, Kd sliders, presets, plant choice from Module 1 or Module 3 | Browser: presets and extreme values give finite plots |
| True output and sensor reading on the same plot | y, ym and the ideal-sensor y on one chart, marker where y first reaches r | Browser: one y path and one ym path; default loop shows 41.3% true vs 28.2% sensor overshoot |
| Overshoot grows with τs until the loop oscillates | "Overshoot against τs" chart from `sweep()`; unstable range shaded from the Routh–Hurwitz test; critical τs card and status | Unit tests: overshoot non-decreasing up to τs,crit = 1 s, no stable point above it; critical τs agrees in closed form, by scan and by simulation; browser: τs = 1.5 s is reported unstable, and a limit cycle with the u limit |
| The controller only controls what the sensor says | e = r − ym in the simulator; the page reports ym, the error and u when y reaches r | Unit test: e = r − ym at every sample and ym is 45% short when y reaches r; browser: the note reads 0.45 |
| Predict, then check | Three experiments: slower sensor, y vs ym, fix with a faster sensor | Browser: empty guess blocked, correct and incorrect feedback with numbers |
| Theory | `modules/control/analysis.js`: characteristic polynomial, Routh–Hurwitz, critical τs, poles | Unit tests: hand-derived polynomials, Routh against the roots, second-order band 2 ± √3 |
| P2 checks on the page | `validate()` in `modules/p2/model.js` (7 rows) | All rows pass in Node and on the page |
| Phone layout | Responsive grid, narrow block diagram with the sensor | No horizontal overflow at 390 and 320 px |
| P1 and HW1 still work | Router extended; P1 and HW1 modules untouched. Shared `sim.js`: the window also covers τs, a run is settled only when ym has settled too, and the fastest-rate formula is exported | `npm test` (P1 tests unchanged), `browser.mjs` (17), `browser-module2.mjs` (17), `browser-p1.mjs` (18) still pass |

Executed: `npm test` (49 tests, 0 failed), `node tests/browser-p2.mjs` (16 checks passed), plus the HW1 and P1 browser runners, headless Chrome, Node.js v22.

Limits: the stability shading and critical τs are for the linear loop; with a u limit the loop is nonlinear and only the simulation applies. The sensor has gain 1. Near the critical τs the swings decay or grow so slowly that a finite simulation window cannot settle them; without a limit the page then follows the Routh–Hurwitz result. For the motor, τs = 10 ms is an assumed encoder-filter setting, not a measurement.
