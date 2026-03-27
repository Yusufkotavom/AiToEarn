import type { ForwardedRef } from 'react'
import type { SocialAccount } from '@/api/types/account.type'
import { CheckOutlined } from '@ant-design/icons'
import { Avatar, Checkbox, Collapse, Empty, Tooltip } from 'antd'
import Link from 'next/link'
import { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { getAccountGroupApi } from '@/api/account'
import { AccountPlatInfoMap } from '@/app/config/platConfig'
import { useTransClient } from '@/app/i18n/client'
import { useAccountStore } from '@/store/account'
import styles from '../chooseAccountModule.module.scss'

// Account group type
interface AccountGroup {
  id: string
  name: string
  rank: number
  isDefault: boolean
  children?: SocialAccount[]
}

export interface ISimpleAccountChooseRef {
  /**
   * Restore selected state
   */
  recover: () => void
  // Reset transient state when modal closes
  init: () => void
}

export interface ISimpleAccountChooseProps {
  onChange?: (choosedAcounts: SocialAccount[], choosedAcount: SocialAccount) => void
  // externally controlled selected accounts; updated only on confirm
  choosedAccounts?: SocialAccount[]
  // whether multi-select is disabled
  disableAllSelect?: boolean
  // whether selected accounts can be deselected
  isCancelChooseAccount?: boolean
  // whether groups are shown
  showGroup?: boolean
}

const SimpleAccountChoose = memo(
  forwardRef(
    (
      {
        onChange,
        choosedAccounts,
        disableAllSelect = false,
        isCancelChooseAccount = false,
        showGroup = true,
      }: ISimpleAccountChooseProps,
      ref: ForwardedRef<ISimpleAccountChooseRef>,
    ) => {
      const { t } = useTransClient('account')
      // currently selected accounts
      const [choosedAccountsList, setChoosedAccountsList] = useState<SocialAccount[]>([])
      // account groups
      const [accountGroupList, setAccountGroupList] = useState<AccountGroup[]>([])
      // most recent changed account
      const recentData = useRef<SocialAccount>()
      const { accountList } = useAccountStore(
        useShallow(state => ({
          accountList: state.accountList,
        })),
      )

      // fetch account groups
      const fetchAccountGroups = async () => {
        try {
          const res = await getAccountGroupApi()
          const groupList = res?.data

          if (!groupList || groupList.length === 0)
            return

          const accountGroupList: AccountGroup[] = []
          // key=group id, value=group
          const accountGroupMap = new Map<string, AccountGroup>()

          const defaultGroup = groupList.find((v: any) => v.isDefault)!

          groupList.map((v: any) => {
            const accountGroupItem = {
              ...v,
              children: [],
            }
            accountGroupList.push(accountGroupItem)
            accountGroupMap.set(v.id, accountGroupItem)
          })

          accountList.map((v) => {
            ;(
              accountGroupMap.get(v.groupId!) || accountGroupMap.get(defaultGroup.id)!
            ).children?.push(v)
          })

          accountGroupList.sort((a, b) => {
            return a.rank - b.rank
          })

          setAccountGroupList(accountGroupList)
        }
        catch (error) {
          console.error('Failed to fetch account groups:', error)
        }
      }

      // initialize group data
      useEffect(() => {
        if (showGroup && accountList.length > 0) {
          fetchAccountGroups()
        }
      }, [showGroup, accountList])

      // notify on selection changes
      useEffect(() => {
        if (!recentData.current)
          return
        if (onChange)
          onChange(choosedAccountsList, recentData.current!)
      }, [choosedAccountsList, onChange])

      const init = () => {
        recentData.current = undefined
      }

      useImperativeHandle(ref, () => ({
        // 恢复到本次操作之前的状态
        recover() {
          setChoosedAccountsList(choosedAccounts || [])
        },
        init,
      }))

      // select / deselect all
      const handleSelectAll = (checked: boolean) => {
        recentData.current = accountList[0]
        setChoosedAccountsList(checked ? [...accountList] : [])
      }

      // toggle a single account
      const handleSelectAccount = (account: SocialAccount) => {
        recentData.current = account
        setChoosedAccountsList((prev) => {
          const isSelected = prev.some(item => item.id === account.id)
          if (isSelected) {
            return prev.filter(item => item.id !== account.id)
          }
          else {
            return [...prev, account]
          }
        })
      }

      // toggle all accounts in a group
      const handleSelectGroup = (group: AccountGroup, checked: boolean) => {
        if (!group.children || group.children.length === 0)
          return

        recentData.current = group.children[0]
        setChoosedAccountsList((prev) => {
          const groupAccountIds = group.children!.map(account => account.id)
          const selectedInGroup = prev.filter(account => groupAccountIds.includes(account.id))

          if (checked) {
            // select all in group
            const otherAccounts = prev.filter(account => !groupAccountIds.includes(account.id))
            return [...otherAccounts, ...group.children!]
          }
          else {
            // deselect all in group
            return prev.filter(account => !groupAccountIds.includes(account.id))
          }
        })
      }

      // render single account
      const renderAccount = (account: SocialAccount) => {
        const platInfo = AccountPlatInfoMap.get(account.type)
        const isSelected = choosedAccountsList.some(item => item.id === account.id)
        const isDisable = choosedAccounts?.find(k => k.id === account.id) && isCancelChooseAccount
        const isPcNotSupported = platInfo && platInfo.pcNoThis === true

        const handleAccountClick = () => {
          if (isDisable)
            return
          if (isPcNotSupported) {
            return
          }
          handleSelectAccount(account)
        }

        return (
          <div
            key={account.id}
            className={[
              'simpleAccountChoose-accounts-item',
              isSelected && 'simpleAccountChoose-accounts-item--active',
              isDisable && 'simpleAccountChoose-accounts-item--disable',
              isPcNotSupported && 'simpleAccountChoose-accounts-item--pc-not-supported',
            ].join(' ')}
            onClick={handleAccountClick}
          >
            <Tooltip
              title={
                isPcNotSupported ? (
                  <>
                    <p>
                      {t('nickname')}
                      :
                      {account.nickname}
                    </p>
                    <p>
                      {t('platform')}
                      :
                      {platInfo?.name}
                    </p>
                    <p style={{ color: '#ff4d4f' }}>{t('chooseAccount.webUnsupportedPlatform')}</p>
                  </>
                ) : (
                  <>
                    <p>
                      {t('nickname')}
                      :
                      {account.nickname}
                    </p>
                    <p>
                      {t('platform')}
                      :
                      {platInfo?.name}
                    </p>
                  </>
                )
              }
            >
              <div className="simpleAccountChoose-accounts-item-avatar">
                <Avatar src={account.avatar} size="large" />
                {platInfo && (
                  <div className="simpleAccountChoose-accounts-item-platform">
                    <img src={platInfo.icon} alt={platInfo.name} />
                  </div>
                )}
              </div>
              <span className="simpleAccountChoose-accounts-item-nickname">{account.nickname}</span>
            </Tooltip>

            {isPcNotSupported ? (
              <div className="simpleAccountChoose-accounts-item-overlay">
                <span className="simpleAccountChoose-accounts-item-overlay-text">APP</span>
              </div>
            ) : (
              <div className="simpleAccountChoose-accounts-item-choose">
                <CheckOutlined />
              </div>
            )}
          </div>
        )
      }

      // render grouped content
      const renderGroupContent = () => {
        if (!showGroup || accountGroupList.length === 0) {
          return (
            <div className="simpleAccountChoose-accounts">{accountList.map(renderAccount)}</div>
          )
        }

        return (
          <Collapse
            defaultActiveKey={accountGroupList.map(group => group.id)}
            className="simpleAccountChoose-groups"
          >
            {accountGroupList.map((group) => {
              const groupAccountIds = group.children?.map(account => account.id) || []
              const selectedInGroup = choosedAccountsList.filter(account =>
                groupAccountIds.includes(account.id),
              )
              const isGroupSelected = selectedInGroup.length === group.children?.length
              const isGroupIndeterminate
                = selectedInGroup.length > 0 && selectedInGroup.length < (group.children?.length || 0)

              return (
                <Collapse.Panel
                  key={group.id}
                  header={(
                    <div className="simpleAccountChoose-group-header">
                      <Checkbox
                        indeterminate={isGroupIndeterminate}
                        checked={isGroupSelected}
                        onChange={e => handleSelectGroup(group, e.target.checked)}
                        onClick={e => e.stopPropagation()}
                      >
                        {group.name}
                        {' '}
                        (
                        {group.children?.length || 0}
                        )
                      </Checkbox>
                    </div>
                  )}
                >
                  <div className="simpleAccountChoose-accounts">
                    {group.children?.map(renderAccount)}
                  </div>
                </Collapse.Panel>
              )
            })}
          </Collapse>
        )
      }

      return (
        <div className={styles.simpleAccountChoose}>
          {accountList.length === 0 ? (
            <div className="simpleAccountChoose-empty">
              <Empty
                description={(
                  <>
                    {t('chooseAccount.noAccountsPrefix')}
                    {' '}
                    <Link href="/accounts">{t('accountManager')}</Link>
                    {t('chooseAccount.noAccountsSuffix')}
                  </>
                )}
              />
            </div>
          ) : (
            <>
              <div className="simpleAccountChoose-header">
                {!disableAllSelect && (
                  <Checkbox
                    indeterminate={
                      choosedAccountsList.length > 0
                      && choosedAccountsList.length < accountList.length
                    }
                    onChange={e => handleSelectAll(e.target.checked)}
                    checked={choosedAccountsList.length === accountList.length}
                  >
                    {t('chooseAccount.selectAllAccounts')}
                  </Checkbox>
                )}
                <span className="simpleAccountChoose-count">
                  {t('userManage.selected')}
                  {' '}
                  {choosedAccountsList.length}
                  {' '}
                  {t('chooseAccount.countUnit')}
                </span>
              </div>

              {renderGroupContent()}
            </>
          )}

        </div>
      )
    },
  ),
)
SimpleAccountChoose.displayName = 'SimpleAccountChoose'

export default SimpleAccountChoose
