// Page behaviour: the loader, the block wipe between sections, reveals on scroll and the current nav cell.
const root = document.documentElement;
root.classList.add('js');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wipe = document.querySelector('.wipe');
const wait = ms => new Promise(r => setTimeout(r, ms));

// loader: count to 100, then lift the page
(async function load() {
  const out = document.querySelector('[data-count]');
  const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
  if (!reduce) {
    const t0 = performance.now(), dur = 550;
    await new Promise(done => {
      (function tick(now) {
        const p = Math.min(1, (now - t0) / dur);
        out.textContent = Math.round(p * 100);
        p < 1 ? requestAnimationFrame(tick) : done();
      })(t0);
    });
  }
  await Promise.race([fonts, wait(1500)]);
  root.classList.remove('is-loading');
  revealAll();
})();

// block wipe: columns rise to cover the screen, the page jumps, the columns leave upward
document.querySelectorAll('[data-wipe]').forEach(a => a.addEventListener('click', async e => {
  const target = document.querySelector(a.getAttribute('href'));
  if (!target) return;
  e.preventDefault();
  if (reduce) { target.scrollIntoView(); return; }
  wipe.classList.remove('is-out'); wipe.classList.add('is-in');
  await wait(650);
  window.scrollTo({ top: target === document.getElementById('top') ? 0 : target.offsetTop, behavior: 'instant' });
  history.replaceState(null, '', a.getAttribute('href'));
  wipe.classList.add('is-out'); wipe.classList.remove('is-in');
  await wait(700);
  wipe.classList.remove('is-out');
}));

// reveals: headline lines, the about statement and each project's frame, once
function revealAll() {
  const io = new IntersectionObserver(entries => entries.forEach(en => {
    if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
  }), { rootMargin: '0px 0px -12% 0px' });
  document.querySelectorAll('.reveal-lines, .project').forEach(el => io.observe(el));
}

// the nav cell of the section on screen
const cells = [...document.querySelectorAll('.nav__links a')];
const spy = new IntersectionObserver(entries => entries.forEach(en => {
  if (!en.isIntersecting) return;
  cells.forEach(c => c.classList.toggle('is-current', c.getAttribute('href') === '#' + en.target.id));
}), { rootMargin: '-45% 0px -50% 0px' });
['work', 'about', 'contact'].forEach(id => spy.observe(document.getElementById(id)));
