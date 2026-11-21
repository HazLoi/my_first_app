import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthBackground } from '@/components/auth/AuthBackground';
import { Logo } from '@/components/auth/Logo';
import { t } from '@/i18n';
import {
  AUTH_FIELD_ORDER,
  normalizePhone,
  validateAuthForm,
  type AuthErrors,
  type AuthField,
  type AuthMode,
  type AuthValues,
} from '@/lib/authValidation';
import { GatewayError } from '@/services/types';
import { playSound } from '@/services/sound';
import { useAuthStore } from '@/store/authStore';
import './auth.css';

const EMPTY: AuthValues = { phone: '', password: '', confirm: '', displayName: '' };
const LEAVE_MS = 480;

export function AuthScreen() {
  const navigate = useNavigate();
  const session = useAuthStore((state) => state.session);
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);
  const storedRemember = useAuthStore((state) => state.remember);

  const [mode, setMode] = useState<AuthMode>('login');
  const [values, setValues] = useState<AuthValues>(EMPTY);
  const [errors, setErrors] = useState<AuthErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [remember, setRemember] = useState(storedRemember);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const inputs = useRef<Partial<Record<AuthField, HTMLInputElement | null>>>({});

  // Có phiên (vừa đăng nhập hoặc đã lưu) → chuyển cảnh mượt rồi vào sảnh.
  useEffect(() => {
    if (!session) return undefined;
    setLeaving(true);
    const timer = window.setTimeout(() => navigate('/lobby', { replace: true }), LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [session, navigate]);

  const setField = (name: AuthField, value: string): void => {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => (current[name] ? { ...current, [name]: undefined } : current));
    setServerError(null);
  };

  const switchMode = (next: AuthMode): void => {
    if (next === mode || loading) return;
    playSound('click');
    setMode(next);
    setErrors({});
    setServerError(null);
  };

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (loading || leaving) return;
    const found = validateAuthForm(mode, values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const first = AUTH_FIELD_ORDER.find((name) => found[name]);
      if (first) inputs.current[first]?.focus();
      return;
    }
    setLoading(true);
    setServerError(null);
    const phone = normalizePhone(values.phone);
    try {
      if (mode === 'login') await login({ phone, password: values.password, remember });
      else await register({ phone, password: values.password, displayName: values.displayName.trim(), remember });
      playSound('win');
    } catch (error) {
      setServerError(error instanceof GatewayError && error.message ? error.message : t('common.networkError'));
      setLoading(false);
    }
  };

  const renderField = (
    name: AuthField,
    label: string,
    props: { type?: string; autoComplete: string; inputMode?: 'tel' },
  ) => {
    const error = errors[name];
    return (
      <div className={`auth-field ${error ? 'has-error' : ''}`}>
        <input
          ref={(node) => {
            inputs.current[name] = node;
          }}
          className="auth-input"
          type={props.type ?? 'text'}
          inputMode={props.inputMode}
          autoComplete={props.autoComplete}
          placeholder={label}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          value={values[name]}
          disabled={loading || leaving}
          onChange={(event) => setField(name, event.target.value)}
          maxLength={name === 'phone' ? 20 : name === 'displayName' ? 40 : 128}
        />
        {name === 'password' ? (
          <button
            type="button"
            className="auth-eye"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
            aria-pressed={showPassword}
          >
            {showPassword ? '🙈' : '👁'}
          </button>
        ) : null}
        {error ? (
          <p className="auth-error" role="alert">
            {t(error)}
          </p>
        ) : null}
      </div>
    );
  };

  const passwordType = showPassword ? 'text' : 'password';
  const isRegister = mode === 'register';

  return (
    <div className={`auth-root ${leaving ? 'is-leaving' : ''}`}>
      <AuthBackground />
      <div className="auth-shell">
        <Logo />
        <form className="auth-card" onSubmit={(event) => void submit(event)} noValidate>
          <div className="auth-tabs" role="tablist" data-mode={mode}>
            <span className="auth-tab-pill" aria-hidden="true" />
            {(['login', 'register'] as const).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={mode === item}
                className="auth-tab"
                onClick={() => switchMode(item)}
              >
                {t(item === 'login' ? 'auth.login' : 'auth.register')}
              </button>
            ))}
          </div>

          <div className="auth-fields">
            {renderField('phone', t('auth.phone'), { inputMode: 'tel', autoComplete: 'tel' })}
            {isRegister ? renderField('displayName', t('auth.displayName'), { autoComplete: 'nickname' }) : null}
            {renderField('password', t('auth.password'), {
              type: passwordType,
              autoComplete: isRegister ? 'new-password' : 'current-password',
            })}
            {isRegister
              ? renderField('confirm', t('auth.confirmPassword'), { type: passwordType, autoComplete: 'new-password' })
              : null}
          </div>

          <label className="auth-remember">
            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
            <span>{t('auth.remember')}</span>
          </label>

          {serverError ? (
            <p className="auth-error auth-server-error" role="alert">
              {serverError}
            </p>
          ) : null}

          <button type="submit" className="btn btn-gold auth-submit" disabled={loading || leaving}>
            {loading ? (
              <>
                <span className="auth-spinner" aria-hidden="true" />
                {t('auth.processing')}
              </>
            ) : (
              t(isRegister ? 'auth.submitRegister' : 'auth.submitLogin')
            )}
          </button>
          <p className="auth-note">{t('app.virtualCoins')}</p>
        </form>
      </div>
    </div>
  );
}
