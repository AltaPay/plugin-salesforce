# AltaPay for Salesforce Composable Storefront PWA

This plugin enables **AltaPay** as the Payment Service Provider (PSP) for storefronts using the Salesforce Composable Storefront PWA.

**Table of Contents**

[Prerequisites](#prerequisites)

[Installation](#installation)

- [Upload Cartridge](#upload-cartridge)

- [Business Manager Configuration](#business-manager-configuration)

- [Import MarketPay Data](#import-marketpay-data)

[Configuration](#configuration)

- [Credentials](#credentials)

- [Services Configuration](#services-configuration)

- [Get MarketPay Payment Status](#get-marketpay-payment-status)

## Prerequisites

Before configuring the cartridges, you need the below information. These can
be provided by AltaPay.

1.  AltaPay credentials:
    -   Username
    -   Password
2.  AltaPay gateway information:
    -   AltaPay Terminal Configuration JSON: Used for mapping payment methods in Salesforce to terminals in the AltaPay payment gateway.
    -   Gateway

> **Note:** 
> If the API user credentials have not yet been created, refer to the [Creating a New API User](#creating-a-new-api-user) section for step-by-step instructions.

## Installation

Download the AltaPay for Salesforce Commerce Cloud `int_marketpay_headless` cartridge from [Github](https://github.com/AltaPay/plugin-salesforce) for headless implementation.

Then follow the steps below to complete the installation.

### Upload Cartridge

1. Open the **int_marketpay_headless** cartridge into the VS Code.

2. Add your sandbox credentials to `dw.json` file.

3. Open the Prophet extension.

3. Click on the `Prophet: Clean Project/Upload all` from CARTRIDGES window.

4. The Cartridge extension will upload cartridges to the linked sandbox.

### Business Manager Configuration

1. Log into the **SFCC Business Manager** on your sandbox.

2. Navigate to: **Administration** > **Manage Sites** > **[store front site]** > **settings** tab.

9. Add **int_marketpay_headless** cartridge in the cartridge path and click the **Apply** button.

    ![cartridge_path](docs/headless/cartridge_path.png)

### Import MarketPay Data

1. Go to `metadata/MarketPay-Headless/sites` and rename `RefArchGlobal` to match your site ID.

2. Zip `MarketPay-Headless` folder.

3. From the SFCC Business Manager: Navigate to: **Administration** > **Site Development** > **Site Import & Export**.

    ![import_site_data.png](docs/headless/import_site_data.png)

4. Choose file from the **Import** section, click the **Upload** link or button.

Once the import is successful, all the necessary fields will be created in Salesforce to allow our solution to function. You will have configuration fields to set up the environment, as well as payment data fields that help you understand the payment status and provide information necessary for debugging.

## Configuration

From the SFCC Business Manager:

1. Select your site from the list in the top navigation bar.

2. Navigate to: **Merchant Tools** > **Site Preferences** > **Custom Preferences** > **MarketPay**:

3. This is where the merchant can access and configure the MarketPay integration.

4. Fill out the settings as desired. Descriptions of the site preferences are listed in the tables below.

    ### Credentials
    Use the following preferences to configure your AltaPay **credentials**.

    | **Preference** | **Description** |
    |----------------|-----------------|
    | **MarketPay Terminals / Payment Methods** | Mapping of payment methods in Salesforce and terminals in the MarketPay payment gateway. <br> A terminal can only contain one payment method and one currency, However, it is possible to use the same terminal for multiple payment methods. By sharing your requirements with MarketPay, we will ensure that the correct configuration and JSON mapping are created to meet your needs. <br> ![terminals.png](docs/headless/terminals.png) <br> The setting must be structured as shown in the screen illustration. <br> The attribute **id** must correspond with the payment method added in: **Merchant Tools** > **Ordering** > **Payment Methods** plus the preferred currency. The attribute **name** is the name and identifier of the MarketPay terminal. The attribute **allowedlocales** defines which locales that can use the terminal. <br><br> **Note:** The JSON file containing the terminal configuration will be provided by AltaPay. This file defines the mapping between Salesforce payment methods and the terminals configured in the MarketPay payment gateway. |
    | **Organization ID** | To find the organization ID in Business Manager, click App Launcher and then select Administration > Site Development > Salesforce Commerce API Settings. Example: `f_ecom_zzdc_001` |
    | **Organization ShortCode** | To find your short code in Business Manager, click App Launcher and then select Administration > Site Development > Salesforce Commerce API Settings. Example: `kv7kzm78` |
    | **Known IP Protection** | Restricts callbacks to known gateway IP addresses. Disable this option if the store is using a firewall or proxy service (such as Cloudflare) |

    ---

    | **Preference** | **Description** |
    |----------------|-----------------|
    | **Payment Success URL** | URL where MarketPay Redirects After Successful Payment. |
    | **Payment Failed URL** | URL where MarketPay Redirects After Failed Payment. |
    | **Payment Success App URL** | Payment Failed Mobile App DeepLink URL. |
    | **Payment Failed App URL** | URL where MarketPay Redirects After Successful Payment. |

### Services Configuration

From the SFCC Business Manager:

1. Navigate to: **Administration** > **Operations** > **Services** > **Service Credentials**

2. Click on **int.marketpay.service.credential**.

3. Update the URL, replace `https://testgateway.altapaysecure.com` with your gateway URL, and enter Gateway API user and Password and click **Apply** button.

4. Click on **int.marketpay.slas.credentials**.

5. Enter the SLAS User and Password and click **Apply** button.

## Get MarketPay Payment Status

You can use the B2C Commerce API’s [getOrder](https://developer.salesforce.com/docs/commerce/commerce-api/references/orders?meta=getOrder) endpoint to retrieve MarketPay payment data (e.g., transaction ID, captured amount, reserved amount, etc.). All MarketPay-related fields are prefixed with `c_marketPay`.

## Creating a New API User

To create a new API user in your AltaPay account, please follow these steps:

- Log in to your AltaPay account.
- From the left menu, navigate to **Settings** > **API Keys**.

    ![api_keys](docs/api_keys.png)
    
- Click on the **Create New API Key** button from top right corner.
- Fill in the required fields:
    - **Your current password**  
    - **Username**  
    - **Password**  
    - **Assign Shops**
    
    ![api_key](docs/create_api_key.png)
- After entering the details, click **Create**.

The new credentials can now be used as the API Login and API Password in the AltaPay API Login section.