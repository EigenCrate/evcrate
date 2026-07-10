import './styles.css';

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
  throw new Error('App root element was not found.');
}

app.innerHTML = `
  <section class="demo-shell" aria-labelledby="page-title">
    <p class="eyebrow">Browser release gate</p>
    <h1 id="page-title">Simple web testing demo</h1>
    <p class="lede">
      A tiny semantic page used to prove build, preview, accessibility, and future browser-flow checks.
    </p>
    <button type="button" class="primary-action">Open demo flow</button>
  </section>
`;