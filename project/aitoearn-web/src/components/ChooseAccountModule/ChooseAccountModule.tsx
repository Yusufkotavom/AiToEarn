/**
 * ChooseAccountModule
 * Social account picker module with optional platform filtering support.
 */

import type { ForwardedRef } from 'react'
import type { SocialAccount } from '@/api/types/account.type'
import type {
  ISimpleAccountChooseProps,
  ISimpleAccountChooseRef,
} from '@/components/ChooseAccountModule/components/SimpleAccountChoose'
import { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useTransClient } from '@/app/i18n/client'
import SimpleAccountChoose from '@/components/ChooseAccountModule/components/SimpleAccountChoose'
import { Modal } from '@/components/ui/modal'

export interface IChooseAccountModuleRef {
  getSimpleAccountChooseRef: () => ISimpleAccountChooseRef | null
}

export interface IChooseAccountModuleProps {
  open: boolean
  onClose: (open: boolean) => void
  // Simplified account picker props
  simpleAccountChooseProps?: ISimpleAccountChooseProps
  // Confirm callback
  onAccountConfirm?: (accounts: SocialAccount[]) => void
  // Change callback
  onAccountChange?: (accounts: SocialAccount[], account: SocialAccount) => void
}

const ChooseAccountModule = memo(
  forwardRef(
    (
      {
        open,
        onClose,
        onAccountConfirm,
        onAccountChange,
        simpleAccountChooseProps,
      }: IChooseAccountModuleProps,
      ref: ForwardedRef<IChooseAccountModuleRef>,
    ) => {
      const { t } = useTransClient('account')
      const [newChoosedAccounts, setNewChoosedAccounts] = useState<SocialAccount[]>([])
      const simpleAccountChooseRef = useRef<ISimpleAccountChooseRef>(null)

      const handleOk = () => {
        if (onAccountConfirm)
          onAccountConfirm(newChoosedAccounts)
        close()
      }

      const handleCancel = () => {
        setNewChoosedAccounts(simpleAccountChooseProps?.choosedAccounts || [])
        close()
      }

      const close = () => {
        onClose(false)
      }

      useEffect(() => {
        setTimeout(() => simpleAccountChooseRef.current?.recover(), 1)
      }, [simpleAccountChooseProps?.choosedAccounts])

      useEffect(() => {
        simpleAccountChooseRef.current?.init()
      }, [open])

      const ImperativeHandle: IChooseAccountModuleRef = {
        getSimpleAccountChooseRef() {
          return simpleAccountChooseRef.current
        },
      }
      useImperativeHandle(ref, () => ImperativeHandle)

      return (
        <Modal width={800} title={t('chooseAccount.title')} open={open} onOk={handleOk} onCancel={handleCancel}>
          {simpleAccountChooseProps && (
            <SimpleAccountChoose
              {...simpleAccountChooseProps}
              disableAllSelect={simpleAccountChooseProps.disableAllSelect || false}
              ref={simpleAccountChooseRef}
              onChange={(accounts: SocialAccount[], account: SocialAccount) => {
                setNewChoosedAccounts(accounts)
                if (onAccountChange)
                  onAccountChange(accounts, account)
              }}
            />
          )}
        </Modal>
      )
    },
  ),
)
ChooseAccountModule.displayName = 'ChooseAccountModule'

export default ChooseAccountModule
