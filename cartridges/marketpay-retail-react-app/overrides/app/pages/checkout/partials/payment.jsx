/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import React, {useState, useMemo, useEffect, useCallback} from 'react'
import PropTypes from 'prop-types'
import {defineMessage, FormattedMessage, useIntl} from 'react-intl'
import {
    Box,
    Button,
    Checkbox,
    Container,
    Heading,
    Stack,
    Text,
    Divider
} from '@salesforce/retail-react-app/app/components/shared/ui'
import {useForm} from 'react-hook-form'
import {useToast} from '@salesforce/retail-react-app/app/hooks/use-toast'
import {useShopperBasketsMutation} from '@salesforce/commerce-sdk-react'
import {useCurrentBasket} from '@salesforce/retail-react-app/app/hooks/use-current-basket'
import {useCheckout} from '@salesforce/retail-react-app/app/pages/checkout/util/checkout-context'
import {
    getPaymentInstrumentCardType,
    getMaskCreditCardNumber,
    getCreditCardIcon
} from '@salesforce/retail-react-app/app/utils/cc-utils'
import {
    ToggleCard,
    ToggleCardEdit,
    ToggleCardSummary
} from '@salesforce/retail-react-app/app/components/toggle-card'
// Use relative import to pick up the override
import PaymentForm from './payment-form'
import ShippingAddressSelection from '@salesforce/retail-react-app/app/pages/checkout/partials/shipping-address-selection'
import AddressDisplay from '@salesforce/retail-react-app/app/components/address-display'
import {PromoCode, usePromoCode} from '@salesforce/retail-react-app/app/components/promo-code'
import {API_ERROR_MESSAGE} from '@salesforce/retail-react-app/app/constants'
import {isPickupShipment} from '@salesforce/retail-react-app/app/utils/shipment-utils'

console.log('*** PAYMENT.JSX OVERRIDE LOADED ***')

const Payment = () => {
    const {formatMessage} = useIntl()
    const {data: basket} = useCurrentBasket()
    const isPickupOnly =
        basket?.shipments?.length > 0 &&
        basket.shipments.every((shipment) => isPickupShipment(shipment))
    const selectedShippingAddress = useMemo(() => {
        if (!basket?.shipments?.length || isPickupOnly) return null
        const deliveryShipment = basket.shipments.find((shipment) => !isPickupShipment(shipment))
        return deliveryShipment?.shippingAddress || null
    }, [basket?.shipments, isPickupShipment, isPickupOnly])

    const selectedBillingAddress = basket?.billingAddress
    const appliedPayment = basket?.paymentInstruments && basket?.paymentInstruments[0]
    const [billingSameAsShipping, setBillingSameAsShipping] = useState(!isPickupOnly)

    // Track selected payment method from PaymentForm
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null)

    useEffect(() => {
        if (isPickupOnly) {
            setBillingSameAsShipping(false)
        }
    }, [isPickupOnly])

    const {mutateAsync: addPaymentInstrumentToBasket} = useShopperBasketsMutation(
        'addPaymentInstrumentToBasket'
    )
    const {mutateAsync: updateBillingAddressForBasket} = useShopperBasketsMutation(
        'updateBillingAddressForBasket'
    )
    const {mutateAsync: removePaymentInstrumentFromBasket} = useShopperBasketsMutation(
        'removePaymentInstrumentFromBasket'
    )
    const showToast = useToast()
    const showError = () => {
        showToast({
            title: formatMessage(API_ERROR_MESSAGE),
            status: 'error'
        })
    }

    const {step, STEPS, goToStep, goToNextStep} = useCheckout()

    const billingAddressForm = useForm({
        mode: 'onChange',
        shouldUnregister: false,
        defaultValues: {...selectedBillingAddress}
    })

    // Using destructuring to remove properties from the object...
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {removePromoCode, ...promoCodeProps} = usePromoCode()

    const paymentMethodForm = useForm()

    // Helper to check if payment method is MarketPay
    const isMarketPayMethod = (methodId) => {
        return methodId?.startsWith('MARKETPAY_')
    }

    // Handle MarketPay payment submission
    const onMarketPaySubmit = async (paymentMethod) => {
        // Get c_marketPay data from payment method
        const marketPayData = paymentMethod?.c_marketPay || {}

        const paymentInstrument = {
            amount: basket?.orderTotal,
            paymentMethodId: paymentMethod.id,
            c_marketPayToken: marketPayData.access_token || '',
            c_marketPaySessionID: marketPayData.sessionId || '',
            c_marketpayPaymentMethodID: marketPayData.paymentMethod?.id || ''
        }

        const response = await addPaymentInstrumentToBasket({
            parameters: {basketId: basket?.basketId},
            body: paymentInstrument
        })

        // Check for redirect in response
        const marketPayResponse = response?.paymentInstruments?.[0]?.c_marketPay
        if (marketPayResponse?.type === 'REDIRECT' && marketPayResponse?.url) {
            // Store order info for return handling
            sessionStorage.setItem('marketpay_payment_id', marketPayResponse.paymentId)
            sessionStorage.setItem('marketpay_shop_order_id', marketPayResponse.shopOrderId)

            // Redirect to payment gateway
            window.location.href = marketPayResponse.url
            return null // Prevent further processing
        }

        return response
    }

    // Handle standard credit card payment submission
    const onCreditCardSubmit = async (formValue) => {
        // The form gives us the expiration date as `MM/YY` - so we need to split it into
        // month and year to submit them as individual fields.
        const [expirationMonth, expirationYear] = formValue.expiry.split('/')

        const paymentInstrument = {
            paymentMethodId: 'CREDIT_CARD',
            paymentCard: {
                holder: formValue.holder,
                maskedNumber: getMaskCreditCardNumber(formValue.number),
                cardType: getPaymentInstrumentCardType(formValue.cardType),
                expirationMonth: parseInt(expirationMonth),
                expirationYear: parseInt(`20${expirationYear}`)
            }
        }

        return addPaymentInstrumentToBasket({
            parameters: {basketId: basket?.basketId},
            body: paymentInstrument
        })
    }

    const onPaymentSubmit = async (formValue) => {
        if (isMarketPayMethod(selectedPaymentMethod?.id)) {
            return onMarketPaySubmit(selectedPaymentMethod)
        }
        return onCreditCardSubmit(formValue)
    }

    const onBillingSubmit = async () => {
        const isFormValid = await billingAddressForm.trigger()

        if (!isFormValid) {
            return
        }
        const billingAddress = billingSameAsShipping
            ? selectedShippingAddress
            : billingAddressForm.getValues()
        // Using destructuring to remove properties from the object...
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const {addressId, creationDate, lastModified, preferred, ...address} = billingAddress
        return await updateBillingAddressForBasket({
            body: address,
            parameters: {basketId: basket.basketId}
        })
    }

    const onPaymentRemoval = async () => {
        try {
            await removePaymentInstrumentFromBasket({
                parameters: {
                    basketId: basket.basketId,
                    paymentInstrumentId: appliedPayment.paymentInstrumentId
                }
            })
        } catch (e) {
            showError()
        }
    }

    const onSubmit = async () => {
        // For MarketPay, skip form validation since there are no form fields
        if (isMarketPayMethod(selectedPaymentMethod?.id)) {
            if (!appliedPayment) {
                try {
                    const paymentResult = await onMarketPaySubmit(selectedPaymentMethod)
                    // If redirect occurred, don't continue
                    if (paymentResult === null) {
                        return
                    }
                } catch (error) {
                    showError()
                    return
                }
            }

            const updatedBasket = await onBillingSubmit()
            if (updatedBasket) {
                goToNextStep()
            }
            return
        }

        // For credit card, use form validation
        paymentMethodForm.handleSubmit(async (paymentFormValues) => {
            if (!appliedPayment) {
                try {
                    await onCreditCardSubmit(paymentFormValues)
                } catch (error) {
                    showError()
                    return
                }
            }

            const updatedBasket = await onBillingSubmit()
            if (updatedBasket) {
                goToNextStep()
            }
        })()
    }

    // Callback for payment method selection from PaymentForm
    const handlePaymentMethodSelect = useCallback((method) => {
        setSelectedPaymentMethod(method)
    }, [])

    const billingAddressAriaLabel = defineMessage({
        defaultMessage: 'Billing Address Form',
        id: 'checkout_payment.label.billing_address_form'
    })

    // Determine payment summary heading based on applied payment type
    const getPaymentHeading = () => {
        if (appliedPayment && isMarketPayMethod(appliedPayment.paymentMethodId)) {
            return appliedPayment.paymentMethodId.replace('MARKETPAY_', '').replace('_', ' ')
        }
        return formatMessage({defaultMessage: 'Credit Card', id: 'checkout_payment.heading.credit_card'})
    }

    return (
        <ToggleCard
            id="step-3"
            title={formatMessage({defaultMessage: 'Payment', id: 'checkout_payment.title.payment'})}
            editing={step === STEPS.PAYMENT}
            isLoading={
                paymentMethodForm.formState.isSubmitting ||
                billingAddressForm.formState.isSubmitting
            }
            disabled={appliedPayment == null}
            onEdit={() => goToStep(STEPS.PAYMENT)}
            editLabel={formatMessage({
                defaultMessage: 'Edit Payment Info',
                id: 'toggle_card.action.editPaymentInfo'
            })}
        >
            <ToggleCardEdit>
                <Box mt={-2} mb={4}>
                    <PromoCode {...promoCodeProps} itemProps={{border: 'none'}} />
                </Box>

                <Stack spacing={6}>
                    {!appliedPayment ? (
                        <PaymentForm
                            form={paymentMethodForm}
                            onPaymentMethodSelect={handlePaymentMethodSelect}
                        />
                    ) : appliedPayment?.paymentCard ? (
                        <Stack spacing={3}>
                            <Heading as="h3" fontSize="md">
                                <FormattedMessage
                                    defaultMessage="Credit Card"
                                    id="checkout_payment.heading.credit_card"
                                />
                            </Heading>
                            <Stack direction="row" spacing={4}>
                                <PaymentCardSummary payment={appliedPayment} />
                                <Button
                                    variant="link"
                                    size="sm"
                                    colorScheme="red"
                                    onClick={onPaymentRemoval}
                                >
                                    <FormattedMessage
                                        defaultMessage="Remove"
                                        id="checkout_payment.action.remove"
                                    />
                                </Button>
                            </Stack>
                        </Stack>
                    ) : (
                        // MarketPay payment applied
                        <Stack spacing={3}>
                            <Heading as="h3" fontSize="md">
                                {getPaymentHeading()}
                            </Heading>
                            <Stack direction="row" spacing={4}>
                                <Text color="gray.700">
                                    <FormattedMessage
                                        defaultMessage="Payment method selected"
                                        id="checkout_payment.message.marketpay_selected"
                                    />
                                </Text>
                                <Button
                                    variant="link"
                                    size="sm"
                                    colorScheme="red"
                                    onClick={onPaymentRemoval}
                                >
                                    <FormattedMessage
                                        defaultMessage="Remove"
                                        id="checkout_payment.action.remove"
                                    />
                                </Button>
                            </Stack>
                        </Stack>
                    )}

                    <Divider borderColor="gray.100" />

                    <Stack spacing={2}>
                        <Heading as="h3" fontSize="md">
                            <FormattedMessage
                                defaultMessage="Billing Address"
                                id="checkout_payment.heading.billing_address"
                            />
                        </Heading>

                        {!isPickupOnly && (
                            <Checkbox
                                name="billingSameAsShipping"
                                isChecked={billingSameAsShipping}
                                onChange={(e) => setBillingSameAsShipping(e.target.checked)}
                            >
                                <Text fontSize="sm" color="gray.700">
                                    <FormattedMessage
                                        defaultMessage="Same as shipping address"
                                        id="checkout_payment.label.same_as_shipping"
                                    />
                                </Text>
                            </Checkbox>
                        )}

                        {billingSameAsShipping && selectedShippingAddress && (
                            <Box pl={7}>
                                <AddressDisplay address={selectedShippingAddress} />
                            </Box>
                        )}
                    </Stack>

                    {!billingSameAsShipping && (
                        <ShippingAddressSelection
                            form={billingAddressForm}
                            selectedAddress={selectedBillingAddress}
                            formTitleAriaLabel={billingAddressAriaLabel}
                            hideSubmitButton
                            isBillingAddress
                        />
                    )}

                    <Box pt={3}>
                        <Container variant="form">
                            <Button w="full" onClick={onSubmit}>
                                <FormattedMessage
                                    defaultMessage="Review Order"
                                    id="checkout_payment.button.review_order"
                                />
                            </Button>
                        </Container>
                    </Box>
                </Stack>
            </ToggleCardEdit>

            <ToggleCardSummary>
                <Stack spacing={6}>
                    {appliedPayment && (
                        <Stack spacing={3}>
                            <Heading as="h3" fontSize="md">
                                {getPaymentHeading()}
                            </Heading>
                            {appliedPayment.paymentCard ? (
                                <PaymentCardSummary payment={appliedPayment} />
                            ) : (
                                <Text color="gray.700">
                                    <FormattedMessage
                                        defaultMessage="Payment method selected"
                                        id="checkout_payment.message.marketpay_selected"
                                    />
                                </Text>
                            )}
                        </Stack>
                    )}

                    <Divider borderColor="gray.100" />

                    {selectedBillingAddress && (
                        <Stack spacing={2}>
                            <Heading as="h3" fontSize="md">
                                <FormattedMessage
                                    defaultMessage="Billing Address"
                                    id="checkout_payment.heading.billing_address"
                                />
                            </Heading>
                            <AddressDisplay address={selectedBillingAddress} />
                        </Stack>
                    )}
                </Stack>
            </ToggleCardSummary>
        </ToggleCard>
    )
}

const PaymentCardSummary = ({payment}) => {
    const CardIcon = getCreditCardIcon(payment?.paymentCard?.cardType)
    return (
        <Stack direction="row" alignItems="center" spacing={3}>
            {CardIcon && <CardIcon layerStyle="ccIcon" />}

            <Stack direction="row">
                <Text>{payment.paymentCard.cardType}</Text>
                <Text>&bull;&bull;&bull;&bull; {payment.paymentCard.numberLastDigits}</Text>
                <Text>
                    {payment.paymentCard.expirationMonth}/{payment.paymentCard.expirationYear}
                </Text>
            </Stack>
        </Stack>
    )
}

PaymentCardSummary.propTypes = {payment: PropTypes.object}

export default Payment
