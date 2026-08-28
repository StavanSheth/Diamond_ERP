import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';

export const SettingsPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await api.getSettings();
      if (res.success) setSettings(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleChange = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateSettings(settings);
      alert('Settings saved successfully!');
    } catch (err: any) {
      alert(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-surface-bright overflow-hidden">
      <header className="px-margin-page py-lg bg-surface border-b border-outline-variant shrink-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-gutter">
          <div>
            <h2 className="font-headline-lg text-headline-lg text-on-surface">{t('System Settings')}</h2>
            <p className="font-body-md text-on-surface-variant mt-xs">{t('Configure application parameters and defaults.')}</p>
          </div>
          <button 
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-xs bg-[#1565C0] hover:bg-[#0D47A1] text-white rounded-md px-md py-sm font-body-md font-bold transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">save</span>
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </header>

      <div className="flex-1 p-margin-page overflow-y-auto bg-surface-bright">
        {loading ? (
          <div className="flex justify-center items-center h-64 text-on-surface-variant">
            <span className="material-symbols-outlined animate-spin text-[32px]">progress_activity</span>
          </div>
        ) : error ? (
          <div className="bg-error-container text-on-error-container p-md rounded-md">
            {error}
          </div>
        ) : (
          <form className="max-w-3xl flex flex-col gap-xl pb-32" onSubmit={handleSave}>
            
            <section className="bg-surface border border-outline-variant rounded-xl p-lg shadow-sm">
              <h3 className="font-title-lg font-bold text-on-surface flex items-center gap-sm mb-lg border-b border-outline-variant pb-sm">
                <span className="material-symbols-outlined text-primary">store</span>
                Company Information
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                <div className="flex flex-col gap-xs">
                  <label className="font-caption text-caption font-bold text-on-surface-variant">Company Name</label>
                  <input 
                    type="text" 
                    value={settings.companyName || ''}
                    onChange={e => handleChange('companyName', e.target.value)}
                    className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface"
                  />
                </div>
                <div className="flex flex-col gap-xs">
                  <label className="font-caption text-caption font-bold text-on-surface-variant">Contact Email</label>
                  <input 
                    type="email" 
                    value={settings.contactEmail || ''}
                    onChange={e => handleChange('contactEmail', e.target.value)}
                    className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface"
                  />
                </div>
                <div className="flex flex-col gap-xs col-span-1 md:col-span-2">
                  <label className="font-caption text-caption font-bold text-on-surface-variant">Address</label>
                  <textarea 
                    value={settings.companyAddress || ''}
                    onChange={e => handleChange('companyAddress', e.target.value)}
                    rows={3}
                    className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface resize-none"
                  />
                </div>
              </div>
            </section>

            <section className="bg-surface border border-outline-variant rounded-xl p-lg shadow-sm">
              <h3 className="font-title-lg font-bold text-on-surface flex items-center gap-sm mb-lg border-b border-outline-variant pb-sm">
                <span className="material-symbols-outlined text-primary">payments</span>
                Financial & Currency
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                <div className="flex flex-col gap-xs">
                  <label className="font-caption text-caption font-bold text-on-surface-variant">Default Currency</label>
                  <select 
                    value={settings.defaultCurrency || 'INR'}
                    onChange={e => handleChange('defaultCurrency', e.target.value)}
                    className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface"
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-xs">
                  <label className="font-caption text-caption font-bold text-on-surface-variant">Tax Rate (%)</label>
                  <input 
                    type="number"
                    step="0.1" 
                    value={settings.taxRate || '0'}
                    onChange={e => handleChange('taxRate', e.target.value)}
                    className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface"
                  />
                </div>
              </div>
            </section>

            <section className="bg-surface border border-outline-variant rounded-xl p-lg shadow-sm">
              <h3 className="font-title-lg font-bold text-on-surface flex items-center gap-sm mb-lg border-b border-outline-variant pb-sm">
                <span className="material-symbols-outlined text-primary">language</span>
                {t('Language & Localization')}
              </h3>
              
              <div className="flex flex-col gap-xs max-w-md">
                <label className="font-caption text-caption font-bold text-on-surface-variant">{t('Display Language')}</label>
                <select 
                  value={i18n.language}
                  onChange={e => {
                    i18n.changeLanguage(e.target.value);
                    localStorage.setItem('appLanguage', e.target.value);
                  }}
                  className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface"
                >
                  <option value="en">English</option>
                  <option value="hi">हिंदी (Hindi)</option>
                  <option value="bn">বাংলা (Bengali)</option>
                  <option value="te">తెలుగు (Telugu)</option>
                  <option value="mr">मराठी (Marathi)</option>
                  <option value="ta">தமிழ் (Tamil)</option>
                  <option value="ur">اردو (Urdu)</option>
                  <option value="gu">ગુજરાતી (Gujarati)</option>
                  <option value="kn">ಕನ್ನಡ (Kannada)</option>
                  <option value="or">ଓଡ଼ିଆ (Odia)</option>
                  <option value="ml">മലയാളം (Malayalam)</option>
                </select>
                <p className="text-xs text-on-surface-variant mt-1">Changes are applied immediately.</p>
              </div>
            </section>

            <section className="bg-surface border border-outline-variant rounded-xl p-lg shadow-sm">
              <h3 className="font-title-lg font-bold text-on-surface flex items-center gap-sm mb-lg border-b border-outline-variant pb-sm">
                <span className="material-symbols-outlined text-primary">sync</span>
                System & Sync
              </h3>
              
              <div className="flex flex-col gap-md">
                <div className="flex items-center justify-between p-md border border-outline-variant rounded-md">
                  <div>
                    <h4 className="font-title-md font-bold text-on-surface">Auto-Sync to Google Sheets</h4>
                    <p className="font-caption text-caption text-on-surface-variant">Automatically backup data periodically.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={settings.autoSync === 'true'}
                      onChange={e => handleChange('autoSync', e.target.checked ? 'true' : 'false')}
                    />
                    <div className="w-11 h-6 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1565C0]"></div>
                  </label>
                </div>
                
                {settings.autoSync === 'true' && (
                  <div className="flex flex-col gap-xs">
                    <label className="font-caption text-caption font-bold text-on-surface-variant">Sync Interval (Minutes)</label>
                    <select 
                      value={settings.syncInterval || '15'}
                      onChange={e => handleChange('syncInterval', e.target.value)}
                      className="w-full px-md py-sm border border-outline-variant rounded-md bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface"
                    >
                      <option value="5">5 Minutes</option>
                      <option value="15">15 Minutes</option>
                      <option value="30">30 Minutes</option>
                      <option value="60">1 Hour</option>
                    </select>
                  </div>
                )}
              </div>
            </section>
            
          </form>
        )}
      </div>
    </div>
  );
};
