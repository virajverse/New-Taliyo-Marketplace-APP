'use client';

import { useEffect, useState } from 'react';
import { Wrench, MessageCircle } from 'lucide-react';
import { subscribeSmartFetch } from '@/lib/clientCache';

interface SystemSettings {
  maintenanceMode?: boolean;
  supportEmail?: string;
}

export default function SystemSettingsGate() {
  const [maintenance, setMaintenance] = useState(false);
  const [supportEmail, setSupportEmail] = useState('support@taliyotechnologies.com');
  const [supportWhatsapp, setSupportWhatsapp] = useState('917042523611');

  useEffect(() => {
    return subscribeSmartFetch<{ settings?: Record<string, string> }>(
      '/api/site-settings',
      'settings',
      (json) => {
        if (!json?.settings) return;
        const map = json.settings;
        if (map.support_whatsapp) setSupportWhatsapp(map.support_whatsapp.replace(/\D/g, '') || '917042523611');
        if (map.support_email) setSupportEmail(map.support_email);
        if (map.admin_system_settings) {
          try {
            const sys = JSON.parse(map.admin_system_settings) as SystemSettings;
            if (sys.supportEmail) setSupportEmail(sys.supportEmail);
            setMaintenance(Boolean(sys.maintenanceMode));
          } catch {}
        }
      },
    );
  }, []);

  if (!maintenance) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-[#07070d]/95 backdrop-blur-xl flex items-center justify-center p-6 text-white">
      <div className="w-full max-w-sm rounded-3xl border border-purple-500/25 bg-[#121326] p-7 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-500/15 text-purple-300 border border-purple-500/30">
          <Wrench className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold tracking-tight">Scheduled Maintenance</h1>
        <p className="mt-2 text-sm text-gray-300 leading-relaxed">
          Taliyo Marketplace is undergoing a quick upgrade. We&apos;ll be right back shortly.
        </p>
        <p className="mt-3 text-xs text-gray-400">Support: {supportEmail}</p>
        <a
          href={`https://wa.me/${supportWhatsapp}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:brightness-110 transition"
        >
          <MessageCircle className="h-4 w-4" />
          Contact Support on WhatsApp
        </a>
      </div>
    </div>
  );
}
