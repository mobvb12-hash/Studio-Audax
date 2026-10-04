import type { Dispatch, SetStateAction } from 'react'
import { ROTULO_FORM as rotulo } from '@/lib/apresentacao'
import type { PreferenciasCliente } from '@/modules/clientes/types'

export default function PreferenciasBloco({
  preferencias,
  aoMudar,
}: {
  preferencias: PreferenciasCliente
  aoMudar: Dispatch<SetStateAction<PreferenciasCliente>>
}) {
  return (
    <>
      <div className="sm:col-span-2">
        <p className={rotulo}>Notificações</p>
        <div className="flex flex-col gap-1.5">
          <label
            className="flex items-center gap-2 text-sm text-[#121110]"
            htmlFor="cli-notif-email"
          >
            <input
              id="cli-notif-email"
              type="checkbox"
              checked={preferencias.emailAgendamentos}
              onChange={(e) =>
                aoMudar((p) => ({
                  ...p,
                  emailAgendamentos: e.target.checked,
                }))
              }
            />
            Cliente recebe e-mails sobre seus agendamentos
          </label>
          <label
            className="flex items-center gap-2 text-sm text-[#121110]"
            htmlFor="cli-notif-sms"
          >
            <input
              id="cli-notif-sms"
              type="checkbox"
              checked={preferencias.smsLembrete}
              onChange={(e) =>
                aoMudar((p) => ({ ...p, smsLembrete: e.target.checked }))
              }
            />
            Cliente recebe SMS/Notificação Push de lembrete
          </label>
        </div>
      </div>

      <div className="sm:col-span-2">
        <p className={rotulo}>Campanhas</p>
        <div className="flex flex-col gap-1.5">
          <label
            className="flex items-center gap-2 text-sm text-[#121110]"
            htmlFor="cli-camp-sms"
          >
            <input
              id="cli-camp-sms"
              type="checkbox"
              checked={preferencias.smsMarketing}
              onChange={(e) =>
                aoMudar((p) => ({ ...p, smsMarketing: e.target.checked }))
              }
            />
            Cliente recebe SMS marketing
          </label>
          <label
            className="flex items-center gap-2 text-sm text-[#121110]"
            htmlFor="cli-camp-email"
          >
            <input
              id="cli-camp-email"
              type="checkbox"
              checked={preferencias.emailMarketing}
              onChange={(e) =>
                aoMudar((p) => ({ ...p, emailMarketing: e.target.checked }))
              }
            />
            Cliente recebe e-mail marketing
          </label>
        </div>
      </div>
    </>
  )
}
