import type { ForwardedRef } from 'react'
import type { SocialAccount } from '@/api/types/account.type'
import type { PlatType } from '@/app/config/platConfig'
import type { PubType } from '@/app/config/publishConfig'
import { CheckOutlined } from '@ant-design/icons'
import { Avatar, Badge, Checkbox, ConfigProvider, Empty, Segmented, Tooltip } from 'antd'
import Link from 'next/link'
import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { AccountPlatInfoMap } from '@/app/config/platConfig'
import useCssVariables from '@/app/hooks/useCssVariables'
import { useTransClient } from '@/app/i18n/client'
import { useAccountStore } from '@/store/account'
import styles from '../chooseAccountModule.module.scss'

export interface IPlatChooseRef {
  /**
   * Restore selected state
   */
  recover: () => void
  // Reset transient state when modal closes
  init: () => void
  // Set active platform tab
  setActivePlat: (activePlat: PlatType) => void
}

export interface IPlatChooseProps {
  pubType: PubType
  // default selected platform
  defaultPlat?: PlatType
  onChange?: (choosedAcounts: SocialAccount[], choosedAcount: SocialAccount) => void
  // externally controlled selected accounts; updated only on confirm
  choosedAccounts?: SocialAccount[]
  // whether multi-select is disabled
  disableAllSelect?: boolean
  // allowed platforms (default: all)
  allowPlatSet?: Set<PlatType>
  // whether selected accounts can be deselected
  isCancelChooseAccount?: boolean
}

const PlatChoose = memo(
  forwardRef(
    (
      {
        pubType,
        onChange,
        choosedAccounts,
        disableAllSelect = false,
        isCancelChooseAccount = false,
        allowPlatSet,
        defaultPlat,
      }: IPlatChooseProps,
      ref: ForwardedRef<IPlatChooseRef>,
    ) => {
      const { t } = useTransClient('account')
      const cssVars = useCssVariables()
      // all accounts grouped by platform
      const [accountMap, setAccountMap] = useState<Map<PlatType, SocialAccount[]>>(new Map())
      // current active platform
      const [activePlat, setActivePlat] = useState<PlatType | undefined>()
      // selected accounts by platform
      const [choosedAcountMap, setChoosedAcountMap] = useState<Map<PlatType, SocialAccount[]>>(
        new Map(),
      )
      // most recent changed account
      const recentData = useRef<SocialAccount>()
      const { accountList } = useAccountStore(
        useShallow(state => ({
          accountList: state.accountList,
        })),
      )

      // accounts filtered by allowPlatSet
      const accountMapLast = useMemo(() => {
        const newVal = new Map<PlatType, SocialAccount[]>()
        for (const [accountType, accountList] of accountMap) {
          if (!allowPlatSet ? true : allowPlatSet.has(accountType)) {
            newVal.set(accountType, accountList)
          }
        }
        return newVal
      }, [accountMap, allowPlatSet])

      // initialize default active platform
      useEffect(() => {
        const defaultPlatData = Array.from(accountMapLast).find(([plat, data]) => data.length !== 0)
        setActivePlat(
          defaultPlat
          || (defaultPlatData ? defaultPlatData[0] : Array.from(accountMapLast.keys())[0]),
        )
      }, [accountMapLast])

      // all available accounts across platforms
      const getAllAccountList = useMemo(() => {
        const allAccountList = []
        for (const [_, accountList] of accountMapLast) {
          allAccountList.push(...accountList)
        }
        return allAccountList
      }, [accountMapLast])

      // all selected accounts across platforms
      const getChoosedAllAccountList = useMemo(() => {
        const allAccountList = []
        for (const [_, accountList] of choosedAcountMap) {
          allAccountList.push(...accountList)
        }
        return allAccountList
      }, [choosedAcountMap])

      // all accounts under current platform
      const currAccountList = useMemo(
        () => (activePlat && accountMapLast.get(activePlat)) || [],
        [activePlat, accountMapLast],
      )

      // selected accounts under current platform
      const currChoosedAcount = useMemo(
        () => (activePlat && choosedAcountMap.get(activePlat)) || [],
        [activePlat, choosedAcountMap],
      )

      useEffect(() => {
        setAccountMap((prevMap) => {
          const newMap = new Map(prevMap)
          Array.from(AccountPlatInfoMap).map(([key, value]) => {
            if (value.pubTypes.has(pubType)) {
              newMap.set(key, [])
            }
          })
          // assign accounts into platform buckets
          accountList.map((v) => {
            newMap.get(v.type)?.push(v)
          })
          return newMap
        })
      }, [accountList])

      useEffect(() => {
        return () => {
          setAccountMap(new Map())
          setChoosedAcountMap(new Map())
          init()
        }
      }, [])

      // notify on selection changes
      useEffect(() => {
        if (!recentData.current)
          return
        let accounts: SocialAccount[] = []
        Array.from(choosedAcountMap).map(([key, value]) => {
          accounts = [...accounts, ...value]
        })
        if (onChange)
          onChange(accounts, recentData.current!)
      }, [choosedAcountMap])

      const init = () => {
        recentData.current = undefined
      }

      useImperativeHandle(ref, () => ({
        // restore state from props
        recover() {
          if (!choosedAccounts || choosedAccounts.length === 0)
            return setChoosedAcountMap(new Map())

          setChoosedAcountMap(() => {
            const newV = new Map()
            choosedAccounts.map((v) => {
              if (!newV.has(v.type))
                newV.set(v.type, [])
              newV.get(v.type)!.push(v)
            })
            return newV
          })
        },
        setActivePlat,
        init,
      }))

      return (
        <div className={styles.platChoose}>
          {getAllAccountList.length === 0 ? (
            <div className="platChoose-empty">
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
              <div className="platChoose-platSelect">
                {!disableAllSelect && (
                  <Checkbox
                    indeterminate={
                      getChoosedAllAccountList.length > 0
                      && getChoosedAllAccountList.length < getAllAccountList.length
                    }
                    onChange={(e) => {
                      const { checked } = e.target
                      setChoosedAcountMap((v) => {
                        const newMap = new Map(v)
                        recentData.current = currAccountList[0]

                        for (const [accountType, accountList] of accountMapLast) {
                          if (checked) {
                            newMap.set(accountType, accountList)
                          }
                          else {
                            newMap.set(accountType, [])
                          }
                        }
                        return newMap
                      })
                    }}
                    checked={getAllAccountList.length === getChoosedAllAccountList.length}
                  >
                    {t('chooseAccount.selectAllPlatformAccounts')}
                  </Checkbox>
                )}
                <ConfigProvider
                  theme={{
                    components: {
                      Segmented: {
                        trackBg: '#fff',
                        itemSelectedBg: cssVars['--colorPrimary1'],
                        itemHoverBg: cssVars['--colorPrimary2'],
                        itemActiveBg: cssVars['--colorPrimary3'],
                        itemSelectedColor: cssVars['--colorPrimary9'],
                      },
                    },
                  }}
                >
                  <Segmented
                    vertical
                    size="large"
                    value={activePlat}
                    options={Array.from(accountMapLast)
                      .map(([key, value]) => {
                        if (value.length === 0)
                          return undefined
                        const platInfo = AccountPlatInfoMap.get(key)!
                        return {
                          value: key,
                          label: platInfo.name,
                          icon: (
                            <Badge count={choosedAcountMap.get(key)?.length} size="small">
                              <img style={{ width: '25px' }} src={platInfo.icon} />
                            </Badge>
                          ),
                        }
                      })
                      .filter(v => v !== undefined)
                      .filter(v => (allowPlatSet ? allowPlatSet.has(v.value) : true))}
                    onChange={setActivePlat}
                  />
                </ConfigProvider>
              </div>

              <div className="platChoose-con">
                {currAccountList && (
                  <div className="platChoose-con-wrapper">
                    {!disableAllSelect ? (
                      <Checkbox
                        indeterminate={
                          currChoosedAcount.length > 0
                          && currChoosedAcount.length < currAccountList.length
                        }
                        onChange={(e) => {
                          setChoosedAcountMap((v) => {
                            recentData.current = currAccountList[0]
                            return new Map(v).set(
                              activePlat!,
                              e.target.checked ? currAccountList : [],
                            )
                          })
                        }}
                        checked={currChoosedAcount.length === currAccountList.length}
                      >
                        {t('chooseAccount.selectAllSelected')}
                        {' '}
                        {currChoosedAcount.length}
                        {' '}
                        {t('chooseAccount.countUnit')}
                      </Checkbox>
                    ) : (
                      <span>
                        {t('userManage.selected')}
                        {currChoosedAcount.length}
                        {' '}
                        {t('chooseAccount.countUnit')}
                      </span>
                    )}
                    <div className="platChoose-accounts">
                      {currAccountList.map((v) => {
                        // disabled when pre-selected and cancellation is blocked
                        const isDisable
                          = choosedAccounts?.find(k => k.id === v.id) && isCancelChooseAccount
                        return (
                          <div
                            key={v.id}
                            className={[
                              'platChoose-accounts-item',
                              currChoosedAcount.find(k => k.id === v.id)
                              && 'platChoose-accounts-item--active',
                              isDisable && 'platChoose-accounts-item--disable',
                            ].join(' ')}
                            onClick={() => {
                              if (isDisable)
                                return
                              recentData.current = v
                              setChoosedAcountMap((prevV) => {
                                const newV = new Map(prevV)
                                let list = newV.get(activePlat!)
                                if (!list) {
                                  list = []
                                  newV.set(activePlat!, list)
                                }
                                // toggle membership
                                if (list.some(k => k.id === v.id)) {
                                  // remove
                                  list = list.filter(k => k.id !== v.id)
                                }
                                else {
                                  // add
                                  list.push(v)
                                }
                                newV.set(activePlat!, list)
                                return newV
                              })
                            }}
                          >
                            <Tooltip
                              title={(
                                <>
                                  <p>
                                    {t('nickname')}
                                    :
                                    {v.nickname}
                                  </p>
                                </>
                              )}
                            >
                              <Avatar src={v.avatar} />
                              <span className="platChoose-accounts-item-nickname">
                                {v.nickname}
                              </span>
                            </Tooltip>

                            <div className="platChoose-accounts-item-choose">
                              <CheckOutlined />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {AccountPlatInfoMap.get(activePlat!)?.tips && (
                  <div className="platChoose-tips">
                    {AccountPlatInfoMap.get(activePlat!)?.tips?.publish}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )
    },
  ),
)
PlatChoose.displayName = 'PlatChoose'

export default PlatChoose
