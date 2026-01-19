/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import React, {useEffect, useState} from 'react'
import {FormattedMessage, FormattedNumber, useIntl} from 'react-intl'
import PropTypes from 'prop-types'
import {
    Box,
    Flex,
    Radio,
    RadioGroup,
    Stack,
    Text,
    Tooltip,
    Skeleton
} from '@salesforce/retail-react-app/app/components/shared/ui'
import {useCurrentBasket} from '@salesforce/retail-react-app/app/hooks/use-current-basket'
import {usePaymentMethodsForBasket} from '@salesforce/commerce-sdk-react'
import {LockIcon} from '@salesforce/retail-react-app/app/components/icons'
import CreditCardFields from '@salesforce/retail-react-app/app/components/forms/credit-card-fields'
import {useCurrency} from '@salesforce/retail-react-app/app/hooks'

const PaymentForm = ({form, onPaymentMethodSelect}) => {
    const {formatMessage} = useIntl()
    const {data: basket} = useCurrentBasket()
    const {currency} = useCurrency()

    // Fetch payment methods from SCAPI
    const {data: paymentMethodsData, isLoading: isLoadingPaymentMethods} = usePaymentMethodsForBasket(
        {
            parameters: {basketId: basket?.basketId}
        },
        {
            enabled: !!basket?.basketId
        }
    )

    const paymentMethods = paymentMethodsData?.applicablePaymentMethods || []

    // Track selected payment method
    const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState('')

    // Helper to check if a payment method is MarketPay
    const isMarketPayMethod = (methodId) => {
        return methodId?.startsWith('MARKETPAY_')
    }

    // Helper to check if a payment method requires credit card form
    const requiresCreditCardForm = (methodId) => {
        // Only standard CREDIT_CARD requires form, MarketPay methods do not
        return methodId === 'CREDIT_CARD'
    }

    // Set default payment method when data loads
    useEffect(() => {
        if (paymentMethods.length > 0 && !selectedPaymentMethodId) {
            // Default to first MarketPay method if available, otherwise first method
            const marketPayMethod = paymentMethods.find((m) => isMarketPayMethod(m.id))
            const defaultMethod = marketPayMethod || paymentMethods[0]
            setSelectedPaymentMethodId(defaultMethod.id)
        }
    }, [paymentMethods, selectedPaymentMethodId])

    // Notify parent when payment method changes
    useEffect(() => {
        if (selectedPaymentMethodId && onPaymentMethodSelect) {
            const selectedMethod = paymentMethods.find((m) => m.id === selectedPaymentMethodId)
            onPaymentMethodSelect(selectedMethod)
        }
    }, [selectedPaymentMethodId, paymentMethods, onPaymentMethodSelect])

    const handlePaymentMethodChange = (methodId) => {
        setSelectedPaymentMethodId(methodId)
    }

    return (
        <form onSubmit={form.handleSubmit(() => {})}>
            <Stack spacing={8}>
                <Stack spacing={5}>
                    <Box border="1px solid" borderColor="gray.100" rounded="base" overflow="hidden">
                        {isLoadingPaymentMethods ? (
                            <Stack spacing={4} p={4}>
                                <Skeleton height="60px" />
                                <Skeleton height="60px" />
                            </Stack>
                        ) : (
                            <RadioGroup
                                value={selectedPaymentMethodId}
                                onChange={handlePaymentMethodChange}
                                aria-label={formatMessage({
                                    defaultMessage: 'Payment',
                                    id: 'payment_selection.radio_group.assistive_msg'
                                })}
                                name="payment-selection"
                            >
                                {paymentMethods.map((method, index) => {
                                    const isMarketPay = isMarketPayMethod(method.id)
                                    const needsCreditCardForm = requiresCreditCardForm(method.id)
                                    const isSelected = selectedPaymentMethodId === method.id

                                    return (
                                        <Box key={method.id}>
                                            <Box
                                                py={3}
                                                px={[4, 4, 6]}
                                                bg={isSelected ? 'gray.50' : 'white'}
                                                borderBottom={
                                                    index < paymentMethods.length - 1 ||
                                                    (isSelected && needsCreditCardForm)
                                                        ? '1px solid'
                                                        : 'none'
                                                }
                                                borderColor="gray.100"
                                            >
                                                <Radio value={method.id}>
                                                    <Flex justify="space-between" width="100%">
                                                        <Stack direction="row" align="center">
                                                            <Text fontWeight="bold">
                                                                {method.name || method.id}
                                                            </Text>
                                                            <Tooltip
                                                                hasArrow
                                                                placement="top"
                                                                label={formatMessage({
                                                                    defaultMessage:
                                                                        'This is a secure SSL encrypted payment.',
                                                                    id: 'payment_selection.tooltip.secure_payment'
                                                                })}
                                                            >
                                                                <LockIcon color="gray.700" boxSize={5} />
                                                            </Tooltip>
                                                        </Stack>
                                                        <Text fontWeight="bold">
                                                            <FormattedNumber
                                                                value={basket?.orderTotal}
                                                                style="currency"
                                                                currency={currency}
                                                            />
                                                        </Text>
                                                    </Flex>
                                                </Radio>
                                            </Box>

                                            {/* Show credit card fields only for standard CREDIT_CARD */}
                                            {isSelected && needsCreditCardForm && (
                                                <Box p={[4, 4, 6]} borderBottom="1px solid" borderColor="gray.100">
                                                    <Stack spacing={6}>
                                                        <CreditCardFields form={form} />
                                                    </Stack>
                                                </Box>
                                            )}

                                            {/* MarketPay methods - show info message, no form fields needed */}
                                            {isSelected && isMarketPay && (
                                                <Box p={[4, 4, 6]} bg="blue.50" borderBottom="1px solid" borderColor="gray.100">
                                                    <Text fontSize="sm" color="gray.700">
                                                        <FormattedMessage
                                                            defaultMessage="You will be redirected to complete your payment securely."
                                                            id="payment_selection.message.marketpay_redirect"
                                                        />
                                                    </Text>
                                                </Box>
                                            )}
                                        </Box>
                                    )
                                })}

                                {/* Fallback when no payment methods returned */}
                                {paymentMethods.length === 0 && !isLoadingPaymentMethods && (
                                    <Box py={3} px={[4, 4, 6]}>
                                        <Text color="gray.600">
                                                <FormattedMessage
                                                defaultMessage="No payment methods available"
                                                id="payment_selection.message.no_methods"
                                            />
                                        </Text>
                                    </Box>
                                )}
                            </RadioGroup>
                        )}
                    </Box>
                </Stack>
            </Stack>
        </form>
    )
}

PaymentForm.propTypes = {
    /** The form object returned from `useForm` */
    form: PropTypes.object,

    /** Callback when payment method is selected - receives the full payment method object */
    onPaymentMethodSelect: PropTypes.func
}

export default PaymentForm
