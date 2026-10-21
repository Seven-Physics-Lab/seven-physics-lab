/* Every simulation is a plain ES module that exports one mount function:
 *
 *     mount(container, options) -> { destroy() }
 *
 * They are loaded one at a time, only when a simulation page is opened, so
 * the dashboard stays light. Adding a simulation is two lines: drop the file
 * in ./sims and add it here and in src/data/registry.json.
 */
export const LOADERS = {
  'motion-graphs':          () => import('./sims/a1-linked-motion-graphs.js'),
  'projectile-launcher':    () => import('./sims/a1-projectile-launcher.js'),
  'collisions':             () => import('./sims/a2-collisions.js'),
  'incline':                () => import('./sims/a2-incline.js'),
  'circular-motion':        () => import('./sims/a2-circular.js'),
  'work':                   () => import('./sims/a3-work.js'),
  'skate-park':             () => import('./sims/a3-skate-park.js'),
  'mass-on-a-spring':       () => import('./sims/c1-mass-spring.js'),
  'simple-pendulum':        () => import('./sims/c1-simple-pendulum.js'),
  'damping-and-resonance':  () => import('./sims/c1-resonance.js'),
  'wave-anatomy':           () => import('./sims/c2-wave-anatomy.js'),
  'wave-speed-on-a-string': () => import('./sims/c2-string-speed.js'),
  'standing-waves':         () => import('./sims/c4-standing-waves.js'),
  'harmonics-and-pipes':    () => import('./sims/c4-harmonics.js'),
  'resonance-tube':         () => import('./sims/c4-resonance-tube.js'),
  'doppler-effect':         () => import('./sims/c5-doppler-sound.js'),
  'ripple-tank':            () => import('./sims/c3-ripple-tank.js'),
  'refraction-and-tir':     () => import('./sims/c3-refraction.js'),
  'double-slit':            () => import('./sims/c3-double-slit.js'),
  'single-slit':            () => import('./sims/c3-single-slit.js'),
  'diffraction-grating':    () => import('./sims/c3-grating.js'),
  'thin-film':              () => import('./sims/c3-thin-film.js'),
  'internal-resistance':    () => import('./sims/b5-internal-resistance.js'),
  'faraday-bench':          () => import('./sims/d4-induction.js'),
  'gravitational-fields':   () => import('./sims/d1-gravitational-fields.js'),
  'ideal-gas':              () => import('./sims/b3-ideal-gas.js'),
  'photoelectric-effect':   () => import('./sims/e2-photoelectric.js'),
  'compton-scattering':     () => import('./sims/e2-compton.js'),
};
