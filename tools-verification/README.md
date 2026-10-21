# Verification

Nothing here trusts a simulation's own arithmetic. Each script re-implements
the physics independently — in Python, from the laws, not from the simulation's
source — and drives the real simulation in a real browser through Playwright,
comparing the two. Where a number is meant to be visible to a student, the
check reads it out of the page's own readout grid rather than out of
JavaScript, and features are located on the drawn curve rather than assumed.

To run one:

    cd seven-physics-lab
    python3 -m http.server 8731 &
    cp tools-verification/harness-incline.html harness.html          # mounts one sim on a bare page
    python3 tools-verification/verify_friction.py

`verify_friction.py` covers A.2 The Friction Bench: the stick-slip block, the
Greenwood–Williamson contact patch with Hertzian summits, and the
Prandtl–Tomlinson junction. 26 checks, including two convergence tests and
three negative controls.

`verify_incline.py` covers A.2 The Inclined Plane: the resolution of the weight
on the slope, the angle the block lets go at (recovered by tilting the model
until it slips, then taking the tangent), the sliding acceleration, the energy
books including what the stop at the foot absorbs, and the hysteresis between
the angle it starts at and the lower one it stops at. 21 checks, including two
negative controls and a reading taken off the drawn curve.

`verify_circular.py` covers A.2 The Circular Motion Rig: the conical pendulum
against an independent spherical-pendulum integration, the speed that holds a
cone and the period that follows from it, the banked bend's frictionless speed
and the band friction opens around it, and the vertical loop's slowest speed
round for a track and for a rod. 26 checks, including two negative controls and
energy conservation on two benches that were never told to conserve it.

`verify_work.py` covers A.3 Work: the running total of F·dx against an
independent sum for a spring and a rubber band, ½kx² and ½Fx recovered for the
straight-line case and shown to be wrong for the curved one, the work read off
the drawn curve, path independence, W = Fs cos θ and the work-energy theorem
recovered from accumulated work, and the rope angle needing the least pull.
22 checks, including a convergence test and two negative controls.
