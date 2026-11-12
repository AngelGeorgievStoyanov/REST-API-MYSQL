-- Seed data for the dynamic select / service configuration model.
-- Source of truth: hack-trip/src/model/trip.ts (CurrencyCode, CurrencyCodeName,
-- TripTransport, TripTipeOfGroup) plus the FE component settings.
-- Idempotent: safe to run repeatedly.
--   npx prisma db execute --file prisma/seed.sql --schema prisma/schema.prisma
SET NAMES utf8mb4;

-- select_types
INSERT INTO `select_types` (`key`, `name`, `isActive`) VALUES
  ('transport', 'Transport', 1),
  ('group_type', 'Group type', 1),
  ('currency', 'Currency', 1)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `isActive` = VALUES(`isActive`);

-- select_options (transport / group_type / currency)
INSERT INTO `select_options` (`selectTypeId`, `key`, `value`, `sortOrder`, `isActive`)
SELECT st.`id`, o.`key`, o.`value`, o.`sortOrder`, o.`isActive`
FROM (
  SELECT 'transport' AS typeKey, 'car' AS `key`, 'Car' AS `value`, 1 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'transport' AS typeKey, 'bus' AS `key`, 'Bus' AS `value`, 2 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'transport' AS typeKey, 'aircraft' AS `key`, 'Aircraft' AS `value`, 3 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'transport' AS typeKey, 'another_type' AS `key`, 'Another type' AS `value`, 4 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'group_type' AS typeKey, 'family' AS `key`, 'Family' AS `value`, 1 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'group_type' AS typeKey, 'family_with_children' AS `key`, 'Family with children' AS `value`, 2 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'group_type' AS typeKey, 'friends' AS `key`, 'Friends' AS `value`, 3 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'group_type' AS typeKey, 'another_type' AS `key`, 'Another type' AS `value`, 4 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'AED' AS `key`, 'UAE Dirham' AS `value`, 1 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'AFN' AS `key`, 'Afghan Afghani' AS `value`, 2 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'ALL' AS `key`, 'Albanian Lek' AS `value`, 3 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'AMD' AS `key`, 'Armenian Dram' AS `value`, 4 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'ANG' AS `key`, 'Netherlands Antillean Guilder' AS `value`, 5 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'AOA' AS `key`, 'Angolan Kwanza' AS `value`, 6 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'ARS' AS `key`, 'Argentine Peso' AS `value`, 7 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'AUD' AS `key`, 'Australian Dollar' AS `value`, 8 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'AWG' AS `key`, 'Aruban Florin' AS `value`, 9 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'AZN' AS `key`, 'Azerbaijani Manat' AS `value`, 10 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'BAM' AS `key`, 'Bosnia-Herzegovina Convertible Mark' AS `value`, 11 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'BBD' AS `key`, 'Barbadian Dollar' AS `value`, 12 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'BDT' AS `key`, 'Bangladeshi Taka' AS `value`, 13 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'BGN' AS `key`, 'Bulgarian Lev' AS `value`, 14 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'BHD' AS `key`, 'Bahraini Dinar' AS `value`, 15 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'BIF' AS `key`, 'Burundian Franc' AS `value`, 16 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'BMD' AS `key`, 'Bermudian Dollar' AS `value`, 17 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'BND' AS `key`, 'Brunei Dollar' AS `value`, 18 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'BOB' AS `key`, 'Bolivian Boliviano' AS `value`, 19 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'BOV' AS `key`, 'Bolivian Mvdol' AS `value`, 20 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'BRL' AS `key`, 'Brazilian Real' AS `value`, 21 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'BSD' AS `key`, 'Bahamian Dollar' AS `value`, 22 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'BTN' AS `key`, 'Bhutanese Ngultrum' AS `value`, 23 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'BWP' AS `key`, 'Botswanan Pula' AS `value`, 24 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'BYN' AS `key`, 'Belarusian Ruble' AS `value`, 25 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'BZD' AS `key`, 'Belize Dollar' AS `value`, 26 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'CAD' AS `key`, 'Canadian Dollar' AS `value`, 27 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'CDF' AS `key`, 'Congolese Franc' AS `value`, 28 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'CHE' AS `key`, 'WIR Euro' AS `value`, 29 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'CHF' AS `key`, 'Swiss Franc' AS `value`, 30 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'CHW' AS `key`, 'WIR Franc' AS `value`, 31 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'CLF' AS `key`, 'Chilean Unit of Account (UF)' AS `value`, 32 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'CLP' AS `key`, 'Chilean Peso' AS `value`, 33 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'CNY' AS `key`, 'Chinese Yuan' AS `value`, 34 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'COP' AS `key`, 'Colombian Peso' AS `value`, 35 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'COU' AS `key`, 'Unidad de Valor Real' AS `value`, 36 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'CRC' AS `key`, 'Costa Rican Colón' AS `value`, 37 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'CUC' AS `key`, 'Cuban Convertible Peso' AS `value`, 38 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'CUP' AS `key`, 'Cuban Peso' AS `value`, 39 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'CVE' AS `key`, 'Cape Verdean Escudo' AS `value`, 40 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'CZK' AS `key`, 'Czech Koruna' AS `value`, 41 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'DJF' AS `key`, 'Djiboutian Franc' AS `value`, 42 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'DKK' AS `key`, 'Danish Krone' AS `value`, 43 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'DOP' AS `key`, 'Dominican Peso' AS `value`, 44 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'DZD' AS `key`, 'Algerian Dinar' AS `value`, 45 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'EGP' AS `key`, 'Egyptian Pound' AS `value`, 46 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'ERN' AS `key`, 'Eritrean Nakfa' AS `value`, 47 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'ETB' AS `key`, 'Ethiopian Birr' AS `value`, 48 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'EUR' AS `key`, 'Euro' AS `value`, 49 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'FJD' AS `key`, 'Fijian Dollar' AS `value`, 50 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'FKP' AS `key`, 'Falkland Islands Pound' AS `value`, 51 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'FOK' AS `key`, 'Faroese Króna' AS `value`, 52 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'GBP' AS `key`, 'British Pound Sterling' AS `value`, 53 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'GEL' AS `key`, 'Georgian Lari' AS `value`, 54 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'GGP' AS `key`, 'Guernsey Pound' AS `value`, 55 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'GHS' AS `key`, 'Ghanaian Cedi' AS `value`, 56 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'GIP' AS `key`, 'Gibraltar Pound' AS `value`, 57 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'GMD' AS `key`, 'Gambian Dalasi' AS `value`, 58 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'GNF' AS `key`, 'Guinean Franc' AS `value`, 59 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'GTQ' AS `key`, 'Guatemalan Quetzal' AS `value`, 60 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'GYD' AS `key`, 'Guyanese Dollar' AS `value`, 61 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'HKD' AS `key`, 'Hong Kong Dollar' AS `value`, 62 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'HNL' AS `key`, 'Honduran Lempira' AS `value`, 63 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'HRK' AS `key`, 'Croatian Kuna' AS `value`, 64 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'HTG' AS `key`, 'Haitian Gourde' AS `value`, 65 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'HUF' AS `key`, 'Hungarian Forint' AS `value`, 66 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'IDR' AS `key`, 'Indonesian Rupiah' AS `value`, 67 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'ILS' AS `key`, 'Israeli New Shekel' AS `value`, 68 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'IMP' AS `key`, 'Isle of Man Pound' AS `value`, 69 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'INR' AS `key`, 'Indian Rupee' AS `value`, 70 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'IQD' AS `key`, 'Iraqi Dinar' AS `value`, 71 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'IRR' AS `key`, 'Iranian Rial' AS `value`, 72 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'ISK' AS `key`, 'Icelandic Króna' AS `value`, 73 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'JEP' AS `key`, 'Jersey Pound' AS `value`, 74 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'JMD' AS `key`, 'Jamaican Dollar' AS `value`, 75 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'JOD' AS `key`, 'Jordanian Dinar' AS `value`, 76 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'JPY' AS `key`, 'Japanese Yen' AS `value`, 77 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'KES' AS `key`, 'Kenyan Shilling' AS `value`, 78 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'KGS' AS `key`, 'Kyrgyzstani Som' AS `value`, 79 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'KHR' AS `key`, 'Cambodian Riel' AS `value`, 80 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'KID' AS `key`, 'Kiribati Dollar' AS `value`, 81 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'KMF' AS `key`, 'Comorian Franc' AS `value`, 82 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'KRW' AS `key`, 'South Korean Won' AS `value`, 83 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'KWD' AS `key`, 'Kuwaiti Dinar' AS `value`, 84 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'KYD' AS `key`, 'Cayman Islands Dollar' AS `value`, 85 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'KZT' AS `key`, 'Kazakhstani Tenge' AS `value`, 86 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'LAK' AS `key`, 'Laotian Kip' AS `value`, 87 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'LBP' AS `key`, 'Lebanese Pound' AS `value`, 88 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'LKR' AS `key`, 'Sri Lankan Rupee' AS `value`, 89 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'LRD' AS `key`, 'Liberian Dollar' AS `value`, 90 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'LSL' AS `key`, 'Lesotho Loti' AS `value`, 91 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'LYD' AS `key`, 'Libyan Dinar' AS `value`, 92 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'MAD' AS `key`, 'Moroccan Dirham' AS `value`, 93 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'MDL' AS `key`, 'Moldovan Leu' AS `value`, 94 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'MGA' AS `key`, 'Malagasy Ariary' AS `value`, 95 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'MKD' AS `key`, 'Macedonian Denar' AS `value`, 96 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'MMK' AS `key`, 'Myanmar Kyat' AS `value`, 97 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'MNT' AS `key`, 'Mongolian Tugrik' AS `value`, 98 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'MOP' AS `key`, 'Macanese Pataca' AS `value`, 99 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'MRU' AS `key`, 'Mauritanian Ouguiya' AS `value`, 100 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'MUR' AS `key`, 'Mauritian Rupee' AS `value`, 101 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'MVR' AS `key`, 'Maldivian Rufiyaa' AS `value`, 102 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'MWK' AS `key`, 'Malawian Kwacha' AS `value`, 103 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'MXN' AS `key`, 'Mexican Peso' AS `value`, 104 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'MXV' AS `key`, 'Mexican Unidad de Inversion (UDI)' AS `value`, 105 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'MYR' AS `key`, 'Malaysian Ringgit' AS `value`, 106 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'MZN' AS `key`, 'Mozambican Metical' AS `value`, 107 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'NAD' AS `key`, 'Namibian Dollar' AS `value`, 108 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'NGN' AS `key`, 'Nigerian Naira' AS `value`, 109 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'NIO' AS `key`, 'Nicaraguan Córdoba' AS `value`, 110 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'NOK' AS `key`, 'Norwegian Krone' AS `value`, 111 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'NPR' AS `key`, 'Nepalese Rupee' AS `value`, 112 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'NZD' AS `key`, 'New Zealand Dollar' AS `value`, 113 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'OMR' AS `key`, 'Omani Rial' AS `value`, 114 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'PAB' AS `key`, 'Panamanian Balboa' AS `value`, 115 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'PEN' AS `key`, 'Peruvian Sol' AS `value`, 116 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'PGK' AS `key`, 'Papua New Guinean Kina' AS `value`, 117 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'PHP' AS `key`, 'Philippine Peso' AS `value`, 118 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'PKR' AS `key`, 'Pakistani Rupee' AS `value`, 119 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'PLN' AS `key`, 'Polish Złoty' AS `value`, 120 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'PYG' AS `key`, 'Paraguayan Guaraní' AS `value`, 121 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'QAR' AS `key`, 'Qatari Riyal' AS `value`, 122 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'RON' AS `key`, 'Romanian Leu' AS `value`, 123 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'RSD' AS `key`, 'Serbian Dinar' AS `value`, 124 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'RUB' AS `key`, 'Russian Ruble' AS `value`, 125 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'RWF' AS `key`, 'Rwandan Franc' AS `value`, 126 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'SAR' AS `key`, 'Saudi Riyal' AS `value`, 127 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'SBD' AS `key`, 'Solomon Islands Dollar' AS `value`, 128 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'SCR' AS `key`, 'Seychellois Rupee' AS `value`, 129 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'SDG' AS `key`, 'Sudanese Pound' AS `value`, 130 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'SEK' AS `key`, 'Swedish Krona' AS `value`, 131 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'SGD' AS `key`, 'Singapore Dollar' AS `value`, 132 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'SHP' AS `key`, 'Saint Helena Pound' AS `value`, 133 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'SLL' AS `key`, 'Sierra Leonean Leone' AS `value`, 134 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'SOS' AS `key`, 'Somali Shilling' AS `value`, 135 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'SRD' AS `key`, 'Surinamese Dollar' AS `value`, 136 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'SSP' AS `key`, 'South Sudanese Pound' AS `value`, 137 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'STN' AS `key`, 'São Tomé and Príncipe Dobra' AS `value`, 138 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'SVC' AS `key`, 'Salvadoran Colón' AS `value`, 139 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'SYP' AS `key`, 'Syrian Pound' AS `value`, 140 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'SZL' AS `key`, 'Swazi Lilangeni' AS `value`, 141 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'THB' AS `key`, 'Thai Baht' AS `value`, 142 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'TJS' AS `key`, 'Tajikistani Somoni' AS `value`, 143 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'TMT' AS `key`, 'Turkmenistani Manat' AS `value`, 144 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'TND' AS `key`, 'Tunisian Dinar' AS `value`, 145 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'TOP' AS `key`, 'Tongan Pa anga' AS `value`, 146 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'TRY' AS `key`, 'Turkish Lira' AS `value`, 147 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'TTD' AS `key`, 'Trinidad and Tobago Dollar' AS `value`, 148 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'TWD' AS `key`, 'New Taiwan Dollar' AS `value`, 149 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'TZS' AS `key`, 'Tanzanian Shilling' AS `value`, 150 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'UAH' AS `key`, 'Ukrainian Hryvnia' AS `value`, 151 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'UGX' AS `key`, 'Ugandan Shilling' AS `value`, 152 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'USD' AS `key`, 'United States Dollar' AS `value`, 153 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'USN' AS `key`, 'United States Dollar (Next day)' AS `value`, 154 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'USS' AS `key`, 'United States Dollar (Same day)' AS `value`, 155 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'UYI' AS `key`, 'Uruguayan Peso en Unidades Indexadas (URUIURUI)' AS `value`, 156 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'UYU' AS `key`, 'Uruguayan Peso' AS `value`, 157 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'UYW' AS `key`, 'Unidad Previsional' AS `value`, 158 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'UZS' AS `key`, 'Uzbekistan Som' AS `value`, 159 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'VES' AS `key`, 'Venezuelan Bolívar Soberano' AS `value`, 160 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'VND' AS `key`, 'Vietnamese Đồng' AS `value`, 161 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'VUV' AS `key`, 'Vanuatu Vatu' AS `value`, 162 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'WST' AS `key`, 'Samoan Tala' AS `value`, 163 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'XAF' AS `key`, 'CFA Franc BEAC' AS `value`, 164 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'XAG' AS `key`, 'Silver Ounce' AS `value`, 165 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'XAU' AS `key`, 'Gold Ounce' AS `value`, 166 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'XBA' AS `key`, 'European Composite Unit (EURCO)' AS `value`, 167 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'XBB' AS `key`, 'European Monetary Unit (E.M.U.-6)' AS `value`, 168 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'XBC' AS `key`, 'European Unit of Account 9 (E.U.A.-9)' AS `value`, 169 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'XBD' AS `key`, 'European Unit of Account 17 (E.U.A.-17)' AS `value`, 170 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'XCD' AS `key`, 'East Caribbean Dollar' AS `value`, 171 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'XDR' AS `key`, 'Special Drawing Rights' AS `value`, 172 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'XOF' AS `key`, 'CFA Franc BCEAO' AS `value`, 173 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'XPD' AS `key`, 'Palladium Ounce' AS `value`, 174 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'XPF' AS `key`, 'CFP Franc' AS `value`, 175 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'XPT' AS `key`, 'Platinum Ounce' AS `value`, 176 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'XSU' AS `key`, 'Sucre' AS `value`, 177 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'XTS' AS `key`, 'Testing Currency Code' AS `value`, 178 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'XUA' AS `key`, 'ADB Unit of Account' AS `value`, 179 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'XXX' AS `key`, 'No currency' AS `value`, 180 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'YER' AS `key`, 'Yemeni Rial' AS `value`, 181 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'ZAR' AS `key`, 'South African Rand' AS `value`, 182 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'ZMW' AS `key`, 'Zambian Kwacha' AS `value`, 183 AS sortOrder, 1 AS isActive
  UNION ALL
  SELECT 'currency' AS typeKey, 'ZWL' AS `key`, 'Zimbabwean Dollar' AS `value`, 184 AS sortOrder, 1 AS isActive
) o
JOIN `select_types` st ON st.`key` = o.typeKey
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), `sortOrder` = VALUES(`sortOrder`), `isActive` = VALUES(`isActive`);

-- service_types
INSERT INTO `service_types` (`key`, `name`, `isActive`) VALUES
  ('google_maps', 'Google Maps', 1),
  ('mui', 'MUI', 1),
  ('ui', 'UI', 1),
  ('visual', 'Visual', 1),
  ('routing', 'Routing', 1)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `isActive` = VALUES(`isActive`);

-- service_configs
INSERT INTO `service_configs` (`serviceTypeId`, `key`, `value`, `type`, `isActive`)
SELECT st.`id`, c.`key`, c.`value`, c.`type`, 1
FROM (
  SELECT 'google_maps' AS serviceKey, 'api_key_env' AS `key`, 'VITE_GOOGLE_KEY' AS `value`, 'string' AS `type`, 1 AS isActive
  UNION ALL
  SELECT 'google_maps' AS serviceKey, 'map_width' AS `key`, '600px' AS `value`, 'string' AS `type`, 1 AS isActive
  UNION ALL
  SELECT 'google_maps' AS serviceKey, 'map_height' AS `key`, '250px' AS `value`, 'string' AS `type`, 1 AS isActive
  UNION ALL
  SELECT 'google_maps' AS serviceKey, 'zoom_control' AS `key`, 'true' AS `value`, 'boolean' AS `type`, 1 AS isActive
  UNION ALL
  SELECT 'google_maps' AS serviceKey, 'gesture_handling' AS `key`, 'greedy' AS `value`, 'string' AS `type`, 1 AS isActive
  UNION ALL
  SELECT 'google_maps' AS serviceKey, 'point_map_height' AS `key`, '150px' AS `value`, 'string' AS `type`, 1 AS isActive
  UNION ALL
  SELECT 'google_maps' AS serviceKey, 'point_map_type_control' AS `key`, 'false' AS `value`, 'boolean' AS `type`, 1 AS isActive
  UNION ALL
  SELECT 'mui' AS serviceKey, 'theme_direction' AS `key`, 'ltr' AS `value`, 'string' AS `type`, 1 AS isActive
  UNION ALL
  SELECT 'ui' AS serviceKey, 'page_size_options' AS `key`, '[5,10,20,50]' AS `value`, 'json' AS `type`, 1 AS isActive
  UNION ALL
  SELECT 'ui' AS serviceKey, 'page_size_default' AS `key`, '5' AS `value`, 'number' AS `type`, 1 AS isActive
  UNION ALL
  SELECT 'visual' AS serviceKey, 'image_base_url' AS `key`, 'https://storage.googleapis.com/hack-trip' AS `value`, 'string' AS `type`, 1 AS isActive
  UNION ALL
  SELECT 'visual' AS serviceKey, 'background_images_base_url' AS `key`, 'https://storage.googleapis.com/hack-trip-background-images' AS `value`, 'string' AS `type`, 1 AS isActive
  UNION ALL
  SELECT 'visual' AS serviceKey, 'thumb_width' AS `key`, '164' AS `value`, 'number' AS `type`, 1 AS isActive
  UNION ALL
  SELECT 'visual' AS serviceKey, 'thumb_height' AS `key`, '164' AS `value`, 'number' AS `type`, 1 AS isActive
  UNION ALL
  SELECT 'visual' AS serviceKey, 'thumb_quality' AS `key`, '50' AS `value`, 'number' AS `type`, 1 AS isActive
  UNION ALL
  SELECT 'visual' AS serviceKey, 'thumb_fit' AS `key`, 'crop' AS `value`, 'string' AS `type`, 1 AS isActive
  UNION ALL
  SELECT 'visual' AS serviceKey, 'thumb_auto' AS `key`, 'format' AS `value`, 'string' AS `type`, 1 AS isActive
  UNION ALL
  SELECT 'routing' AS serviceKey, 'home_path' AS `key`, '/' AS `value`, 'string' AS `type`, 1 AS isActive
  UNION ALL
  SELECT 'routing' AS serviceKey, 'login_path' AS `key`, '/login' AS `value`, 'string' AS `type`, 1 AS isActive
  UNION ALL
  SELECT 'routing' AS serviceKey, 'not_found_path' AS `key`, '/not-found' AS `value`, 'string' AS `type`, 1 AS isActive
  UNION ALL
  SELECT 'routing' AS serviceKey, 'verify_email_path' AS `key`, '/users/verify-email/:userId/:token' AS `value`, 'string' AS `type`, 1 AS isActive
) c
JOIN `service_types` st ON st.`key` = c.serviceKey
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), `type` = VALUES(`type`), `isActive` = VALUES(`isActive`);
