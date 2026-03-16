import WebApp from '@twa-dev/sdk';
import { FormEvent, useState } from 'react';
import { useEffect } from 'react';
import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api/client';

export function LoginPage() {
  const [initData, setInitData] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const authTriggeredRef = useRef(false);

  async function authorize(currentInitData: string) {
    setLoading(true);
    setError(null);

    try {
      const session = await api<{ accessToken: string }>('/auth/telegram/init', 'POST', {
        initData: currentInitData,
      });
      setToken(session.accessToken);
      navigate('/', { replace: true });
    } catch (authError) {
      setError((authError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await authorize(initData);
  }

  useEffect(() => {
    if (authTriggeredRef.current) {
      return;
    }

    if (WebApp?.initData) {
      authTriggeredRef.current = true;
      setInitData(WebApp.initData);
      void authorize(WebApp.initData);
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    const devInitData = searchParams.get('devInitData');
    if (devInitData) {
      setInitData(devInitData);
    }
  }, []);

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Telegram Mini App</p>
        <h1>Биржа заданий для исполнителей и заказчиков</h1>
        <p className="lede">
          Если приложение открыто из Telegram, вход выполнится автоматически. В браузере
          можно вручную вставить `initData`.
        </p>
      </section>

      <form className="panel auth-panel" onSubmit={handleSubmit}>
        <label>
          Telegram init data
          <textarea
            value={initData}
            onChange={(event) => setInitData(event.target.value)}
            rows={4}
          />
        </label>

        <button type="submit" className="primary" disabled={loading}>
          {loading ? 'Входим...' : 'Открыть приложение'}
        </button>

        {error ? <p className="error">{error}</p> : null}
      </form>
    </main>
  );
}
