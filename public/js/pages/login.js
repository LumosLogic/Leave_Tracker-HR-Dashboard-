'use strict';

// ── Login Page ────────────────────────────────────────────────────────────────
function renderLoginPage() {
  return `
    <main class="flex min-h-screen bg-background text-on-background" style="font-family:'Inter',sans-serif">

      <!-- Left Side: Brand Panel -->
      <section class="hidden lg:flex w-1/2 relative overflow-hidden bg-primary items-center justify-center p-3xl">
        <div class="absolute inset-0 z-0"
          style="background:linear-gradient(135deg,#2d1fb5 0%,#3525cd 45%,#4f46e5 100%)">
        </div>
        <div class="absolute inset-0 z-0"
          style="background-image:linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px);background-size:40px 40px">
        </div>
        <div class="absolute top-0 right-0 w-96 h-96 rounded-full opacity-20"
          style="background:radial-gradient(circle,rgba(255,255,255,.3) 0%,transparent 65%)">
        </div>

        <div class="relative z-10 max-w-xl text-on-primary">
          <div class="flex items-center gap-md mb-xl">
            <span class="material-symbols-outlined text-on-primary text-[40px]">blur_on</span>
            <h1 class="text-[24px] font-bold tracking-tight text-white">Lumens HR</h1>
          </div>
          <h2 class="text-[40px] font-bold leading-tight mb-lg text-white" style="letter-spacing:-0.02em">
            Elevating Human<br/>Resources with<br/>Precision.
          </h2>
          <p class="text-[15px] text-white/80 leading-relaxed mb-2xl max-w-md">
            Experience next-generation attendance tracking, leave management, and employee engagement in one seamless platform.
          </p>
          <div class="grid grid-cols-2 gap-lg">
            <div class="p-lg rounded-xl border border-white/20" style="background:rgba(255,255,255,.1);backdrop-filter:blur(12px)">
              <span class="material-symbols-outlined mb-sm text-white">timer</span>
              <p class="text-[11px] font-semibold uppercase tracking-wider opacity-70 text-white">Uptime</p>
              <p class="text-[22px] font-bold text-white">99.9%</p>
            </div>
            <div class="p-lg rounded-xl border border-white/20" style="background:rgba(255,255,255,.1);backdrop-filter:blur(12px)">
              <span class="material-symbols-outlined mb-sm text-white">groups</span>
              <p class="text-[11px] font-semibold uppercase tracking-wider opacity-70 text-white">Active Users</p>
              <p class="text-[22px] font-bold text-white">2M+</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Right Side: Login Form -->
      <section class="w-full lg:w-1/2 flex items-center justify-center bg-surface-container-lowest p-lg">
        <div class="w-full max-w-[440px] space-y-xl">

          <!-- Mobile branding -->
          <div class="lg:hidden flex items-center gap-sm mb-2xl">
            <span class="material-symbols-outlined text-primary text-[28px]">blur_on</span>
            <span class="text-[18px] font-semibold text-primary">Lumens HR</span>
          </div>

          <div class="space-y-sm">
            <h2 class="text-[28px] font-semibold text-on-surface" style="letter-spacing:-0.02em">Welcome back</h2>
            <p class="text-[13px] text-on-surface-variant">Please enter your credentials to access the Management Console.</p>
          </div>

          <!-- Demo credentials -->
          <div class="p-md rounded-xl border border-primary/20 bg-primary/5 text-[12px]">
            <p class="font-semibold text-primary mb-1">Demo Credentials</p>
            <p class="text-on-surface-variant leading-6">
              Admin: admin@company.com / admin123<br/>
              Employee: alice@company.com / password123
            </p>
          </div>

          <form id="login-form" class="space-y-lg">
            <!-- Email -->
            <div class="space-y-sm">
              <label class="block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant" for="login-email">Email Address</label>
              <div class="relative group">
                <span class="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors text-[20px]">mail</span>
                <input
                  class="w-full pl-[44px] pr-md py-md bg-surface-container-low border border-outline-variant rounded-xl text-[13px] text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  id="login-email"
                  type="email"
                  value="admin@company.com"
                  required
                  placeholder="name@company.com"
                  autocomplete="email"
                />
              </div>
            </div>

            <!-- Password -->
            <div class="space-y-sm">
              <label class="block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant" for="login-password">Password</label>
              <div class="relative group">
                <span class="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors text-[20px]">lock</span>
                <input
                  class="w-full pl-[44px] pr-[44px] py-md bg-surface-container-low border border-outline-variant rounded-xl text-[13px] text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  id="login-password"
                  type="password"
                  value="admin123"
                  required
                  placeholder="••••••••"
                  autocomplete="current-password"
                />
                <button
                  type="button"
                  id="toggle-password"
                  class="absolute right-md top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors"
                  onclick="(function(){var i=document.getElementById('login-password'),b=document.getElementById('toggle-password');if(i.type==='password'){i.type='text';b.querySelector('span').textContent='visibility_off';}else{i.type='password';b.querySelector('span').textContent='visibility';}})()">
                  <span class="material-symbols-outlined text-[20px]">visibility</span>
                </button>
              </div>
            </div>

            <!-- Error -->
            <div id="login-error" class="hidden p-md rounded-xl border border-error/20 bg-error/5 text-error text-[12px] font-medium"></div>

            <!-- Submit -->
            <div class="pt-sm">
              <button
                type="submit"
                class="w-full py-md bg-primary text-on-primary text-[12px] font-semibold uppercase tracking-widest rounded-xl hover:bg-primary-container transition-all active:scale-[0.98]"
                id="login-btn"
                style="box-shadow:0 8px 24px rgba(53,37,205,.3)">
                Login to Console
              </button>
            </div>
          </form>

          <footer class="pt-md text-center">
            <p class="text-[12px] text-on-surface-variant">
              Don't have an account?
              <a class="text-primary font-semibold hover:underline" href="#">Contact HR Admin</a>
            </p>
            <div class="mt-md flex justify-center gap-lg">
              <a class="text-[11px] text-outline hover:text-on-surface transition-colors" href="#">Privacy Policy</a>
              <a class="text-[11px] text-outline hover:text-on-surface transition-colors" href="#">Terms of Service</a>
            </div>
          </footer>
        </div>
      </section>
    </main>`;
}

function bindLogin() {
  const errEl = document.getElementById('login-error');
  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;margin:0 auto"></div>';
    errEl.classList.add('hidden');
    errEl.style.display = '';
    try {
      const { token, user } = await apiPost('/auth/login', {
        email:    document.getElementById('login-email').value,
        password: document.getElementById('login-password').value,
      });
      saveAuth(token, user);
      navigate('dashboard');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
      btn.disabled = false;
      btn.innerHTML = 'Login to Console';
    }
  });
}
