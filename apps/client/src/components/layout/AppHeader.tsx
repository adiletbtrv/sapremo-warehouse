import { Layout, Tooltip, Select, Dropdown, Avatar, Button, Grid, theme } from 'antd';
import { MenuOutlined, LogoutOutlined, UserOutlined, DownloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useSyncStore } from '@/store/syncStore';
import { useThemeStore } from '@/store/themeStore';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import ThemeToggle from '../ui/ThemeToggle';

const { Header } = Layout;

interface AppHeaderProps {
  isMobile: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}

export default function AppHeader({ isMobile, setMobileMenuOpen }: AppHeaderProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const screens = Grid.useBreakpoint();

  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);

  const isOnline = useSyncStore((state) => state.isOnline);
  const isSyncing = useSyncStore((state) => state.isSyncing);
  const isDark = useThemeStore((state) => state.isDark);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const { isInstallable, isIos, promptInstall } = usePwaInstall();
  const { token } = theme.useToken();

  return (
    <Header
      style={{
        background: token.colorBgContainer,
        padding: screens.md ? '0 24px' : '0 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: isMobile ? 'space-between' : 'flex-end',
        gap: screens.md ? 16 : 8,
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        height: 'auto',
        minHeight: 64,
        lineHeight: 'normal',
      }}
    >
      {isMobile && (
        <Button
          type="text"
          icon={<MenuOutlined style={{ fontSize: 18 }} />}
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open menu"
        />
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
          gap: screens.md ? 16 : 8,
        }}
      >
        {(isInstallable || isIos) && (
          <Tooltip
            title={
              isIos
                ? t('pwa.iosPrompt', { defaultValue: "Нажмите 'Поделиться' -> 'На экран домой'" })
                : t('pwa.installTooltip', { defaultValue: 'Установить на устройство' })
            }
          >
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={() => void promptInstall()}
              style={{ background: '#0057C2' }}
            >
              {!isMobile && t('pwa.installBtn', { defaultValue: 'Установить' })}
            </Button>
          </Tooltip>
        )}
        <Select
          value={i18n.language || 'ru'}
          onChange={(val) => {
            void i18n.changeLanguage(val);
          }}
          options={[
            { value: 'ru', label: '🇷🇺 РУС' },
            { value: 'ky', label: '🇰🇬 КЫР' },
            { value: 'en', label: '🇬🇧 ENG' },
          ]}
          variant="borderless"
          style={{ minWidth: 90 }}
        />
        <Tooltip
          title={
            isSyncing
              ? t('common.statusSyncing', 'Синхронизация...')
              : isOnline
                ? t('common.statusConnected', 'Подключено')
                : t(
                    'common.statusOffline',
                    'Офлайн — данные синхронизируются при восстановлении связи',
                  )
          }
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: isSyncing ? '#faad14' : isOnline ? '#52c41a' : '#ff4d4f',
                boxShadow: isSyncing
                  ? '0 0 0 2px rgba(250, 173, 20, 0.2)'
                  : isOnline
                    ? '0 0 0 2px rgba(82, 196, 26, 0.2)'
                    : '0 0 0 2px rgba(255, 77, 79, 0.2)',
                animation: isSyncing ? 'pulse 1.5s infinite' : 'none',
              }}
            />
            {(!isMobile || screens.md) && (
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: token.colorTextSecondary,
                }}
              >
                {isSyncing
                  ? t('common.syncing', { defaultValue: 'Синхронизация' })
                  : isOnline
                    ? t('common.online', { defaultValue: 'Онлайн' })
                    : t('common.offline', { defaultValue: 'Офлайн' })}
              </span>
            )}
          </div>
        </Tooltip>

        <ThemeToggle isDark={isDark} onToggle={toggleTheme} />

        {user && (
          <Dropdown
            menu={{
              items: [
                {
                  key: 'profile',
                  icon: <UserOutlined />,
                  label: user.fullName || user.username,
                  disabled: true,
                },
                {
                  type: 'divider',
                },
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: t('common.logout', 'Выйти'),
                  danger: true,
                  onClick: () => {
                    void (async () => {
                      await logout(true);
                      queryClient.clear();
                      await navigate('/login', { replace: true });
                    })();
                  },
                },
              ],
            }}
            placement="bottomRight"
            trigger={['click']}
          >
            <Button
              type="text"
              style={{
                height: 40,
                padding: '0 8px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Avatar size="small" icon={<UserOutlined />} style={{ backgroundColor: '#0057C2' }} />
              {!isMobile && <span style={{ fontWeight: 500 }}>{user.username}</span>}
            </Button>
          </Dropdown>
        )}
      </div>
    </Header>
  );
}
