const loginBtn  = document.getElementById('login-btn');
const btnText   = document.getElementById('btn-text');
const btnLoader = document.getElementById('btn-loader');
const errorEl   = document.getElementById('error-msg');

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
}
function clearError() {
  errorEl.classList.add('hidden');
}
function setLoading(on) {
  loginBtn.disabled = on;
  btnText.classList.toggle('hidden', on);
  btnLoader.classList.toggle('hidden', !on);
}

async function doLogin() {
  clearError();

  const identifier = document.getElementById('identifier').value.trim();
  const password   = document.getElementById('password').value;

  if (!identifier || !password) {
    showError('Please enter your username/email and password.');
    return;
  }

  setLoading(true);

  try {
    // Build Basic auth credentials — base64(identifier:password)
    // We send the base64 string to Go; Go adds the "Basic " prefix and forwards it.
const credentials = btoa(`${identifier}:${password}`);

const res = await fetch('https://learn.reboot01.com/api/auth/signin', {
  method: 'POST',
  headers: {
    'Authorization': 'Basic ' + credentials
  }
});

    const data = await res.json();

    if (!res.ok) {
      // Go passes upstream error through; show a friendly message
      if (res.status === 401 || res.status === 403) {
        throw new Error('Invalid credentials. Check your username/email and password.');
      }
      throw new Error(data.error || `Server error (${res.status})`);
    }

    // reboot01 returns a raw JWT string (JSON-encoded, so it has surrounding quotes).
    // It may be a plain string token or an object — handle both.
    let jwt;
    if (typeof data === 'string') {
      jwt = data;
    } else if (data.token) {
      jwt = data.token;
    } else if (data.access_token) {
      jwt = data.access_token;
    } else {
      // Fallback: stringify was already parsed; use raw text if string-like
      jwt = String(data);
    }

    if (!jwt || jwt === 'null' || jwt === 'undefined') {
      throw new Error('No token received. Please try again.');
    }

    localStorage.setItem('jwt', jwt);
    window.location.href = './profile.html';

  } catch (err) {
    showError(err.message);
  } finally {
    setLoading(false);
  }
}

loginBtn.addEventListener('click', doLogin);
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});
