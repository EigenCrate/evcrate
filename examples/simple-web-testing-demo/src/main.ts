import './styles.css';
import { getNameValidationMessage, MAX_TESTER_NAME_LENGTH } from './validation';

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
  throw new Error('App root element was not found.');
}

function getRequiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Required element was not found: ${selector}`);
  }

  return element;
}

app.innerHTML = `
  <section class="demo-shell" aria-labelledby="page-title">
    <div class="intro-panel">
      <p class="eyebrow">Browser release gate</p>
      <h1 id="page-title">Simple web testing demo</h1>
      <p class="lede">
        A tiny semantic page used to prove clickability, focus, validation, and keyboard release checks.
      </p>
      <button type="button" class="primary-action" id="open-flow-button">Open demo flow</button>
    </div>
    <p class="status-message" id="flow-status" role="status" aria-live="polite">
      Ready to run the browser flow.
    </p>
  </section>

  <dialog class="flow-dialog" id="flow-dialog" aria-labelledby="flow-dialog-title">
    <form class="flow-form" id="flow-form" novalidate>
      <p class="eyebrow">Keyboard safe modal</p>
      <h2 id="flow-dialog-title">Request a release check</h2>
      <p class="dialog-copy">
        Enter a tester name to confirm the modal handles labels, validation, Escape, and focus return.
      </p>
      <div class="field-group">
        <label for="tester-name">Tester name</label>
        <input
          id="tester-name"
          name="testerName"
          type="text"
          maxlength="${MAX_TESTER_NAME_LENGTH}"
          autocomplete="name"
          aria-describedby="tester-name-error"
        />
        <p class="field-error" id="tester-name-error" role="alert" hidden></p>
      </div>
      <div class="dialog-actions">
        <button type="button" class="secondary-action" id="cancel-flow-button">Cancel</button>
        <button type="submit" class="primary-action">Submit check</button>
      </div>
    </form>
  </dialog>
`;

const openFlowButton = getRequiredElement<HTMLButtonElement>('#open-flow-button');
const cancelFlowButton = getRequiredElement<HTMLButtonElement>('#cancel-flow-button');
const flowDialog = getRequiredElement<HTMLDialogElement>('#flow-dialog');
const flowForm = getRequiredElement<HTMLFormElement>('#flow-form');
const testerNameInput = getRequiredElement<HTMLInputElement>('#tester-name');
const testerNameError = getRequiredElement<HTMLElement>('#tester-name-error');
const flowStatus = getRequiredElement<HTMLElement>('#flow-status');

function setValidationError(message: string): void {
  testerNameInput.setAttribute('aria-invalid', 'true');
  testerNameError.textContent = message;
  testerNameError.hidden = false;
}

function clearValidationError(): void {
  testerNameInput.removeAttribute('aria-invalid');
  testerNameError.textContent = '';
  testerNameError.hidden = true;
}

function closeFlowDialog(): void {
  flowDialog.close();
}

openFlowButton.addEventListener('click', () => {
  flowForm.reset();
  clearValidationError();
  flowDialog.showModal();
  testerNameInput.focus();
});

cancelFlowButton.addEventListener('click', closeFlowDialog);

flowDialog.addEventListener('close', () => {
  openFlowButton.focus();
});

testerNameInput.addEventListener('input', clearValidationError);

flowForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const validationMessage = getNameValidationMessage(testerNameInput.value);

  if (validationMessage) {
    setValidationError(validationMessage);
    testerNameInput.focus();
    return;
  }

  flowStatus.textContent = `Release check requested for ${testerNameInput.value.trim()}.`;
  closeFlowDialog();
});
