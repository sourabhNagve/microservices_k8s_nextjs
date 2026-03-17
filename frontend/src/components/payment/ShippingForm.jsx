'use client';

import { useState } from 'react';

// ✅ Field config — single source of truth for defaults, avoids duplication
const DEFAULT_FIELDS = {
  firstName:    '',
  lastName:     '',
  email:        '',
  phone:        '',
  addressLine1: '',
  addressLine2: '',
  city:         '',
  state:        '',
  postalCode:   '',
  country:      'United States',
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ShippingForm({ onSubmit, initialData = {} }) {
  const [formData, setFormData] = useState({
    ...DEFAULT_FIELDS,
    // ✅ initialData spread AFTER defaults — fills known fields, extra fields don't silently overwrite
    ...initialData,
  });

  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.firstName.trim())    newErrors.firstName    = 'First name is required';
    if (!formData.lastName.trim())     newErrors.lastName     = 'Last name is required';
    if (!formData.addressLine1.trim()) newErrors.addressLine1 = 'Address is required';
    if (!formData.city.trim())         newErrors.city         = 'City is required';
    if (!formData.state.trim())        newErrors.state        = 'State is required';
    if (!formData.postalCode.trim())   newErrors.postalCode   = 'Postal code is required';

    // ✅ combined required + format check — empty email now correctly fails
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!EMAIL_REGEX.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateForm()) onSubmit(formData);
  };

  // ── Reusable field wrapper ─────────────────────────────────────────────────
  const Field = ({ id, label, required, error, children }) => (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {label}{required && ' *'}
      </label>
      {children}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );

  const inputClass = (field) =>
    `w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
      errors[field] ? 'border-red-500' : 'border-gray-300'
    }`;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Field id="firstName" label="First Name" required error={errors.firstName}>
          <input id="firstName" name="firstName" type="text" autoComplete="given-name"
            value={formData.firstName} onChange={handleChange}
            className={inputClass('firstName')} placeholder="John" />
        </Field>

        <Field id="lastName" label="Last Name" required error={errors.lastName}>
          <input id="lastName" name="lastName" type="text" autoComplete="family-name"
            value={formData.lastName} onChange={handleChange}
            className={inputClass('lastName')} placeholder="Doe" />
        </Field>
      </div>

      <Field id="email" label="Email Address" required error={errors.email}>
        <input id="email" name="email" type="email" autoComplete="email"
          value={formData.email} onChange={handleChange}
          className={inputClass('email')} placeholder="john.doe@example.com" />
      </Field>

      <Field id="phone" label="Phone Number" error={errors.phone}>
        <input id="phone" name="phone" type="tel" autoComplete="tel"
          value={formData.phone} onChange={handleChange}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          placeholder="+1 (555) 123-4567" />
      </Field>

      <Field id="addressLine1" label="Street Address" required error={errors.addressLine1}>
        <input id="addressLine1" name="addressLine1" type="text" autoComplete="address-line1"
          value={formData.addressLine1} onChange={handleChange}
          className={inputClass('addressLine1')} placeholder="123 Main St" />
      </Field>

      <Field id="addressLine2" label="Apartment, suite, etc. (optional)" error={null}>
        <input id="addressLine2" name="addressLine2" type="text" autoComplete="address-line2"
          value={formData.addressLine2} onChange={handleChange}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          placeholder="Apt 4B" />
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Field id="city" label="City" required error={errors.city}>
          <input id="city" name="city" type="text" autoComplete="address-level2"
            value={formData.city} onChange={handleChange}
            className={inputClass('city')} placeholder="New York" />
        </Field>

        <Field id="state" label="State" required error={errors.state}>
          <input id="state" name="state" type="text" autoComplete="address-level1"
            value={formData.state} onChange={handleChange}
            className={inputClass('state')} placeholder="NY" />
        </Field>

        <Field id="postalCode" label="ZIP Code" required error={errors.postalCode}>
          <input id="postalCode" name="postalCode" type="text" autoComplete="postal-code"
            value={formData.postalCode} onChange={handleChange}
            className={inputClass('postalCode')} placeholder="10001" />
        </Field>
      </div>

      <Field id="country" label="Country" required error={null}>
        <select id="country" name="country" autoComplete="country-name"
          value={formData.country} onChange={handleChange}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        >
          <option value="United States">United States</option>
          <option value="Canada">Canada</option>
          <option value="United Kingdom">United Kingdom</option>
          <option value="Australia">Australia</option>
          <option value="Germany">Germany</option>
          <option value="France">France</option>
        </select>
      </Field>

      <div className="flex justify-end">
        <button type="submit"
          className="bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
        >
          Continue to Payment
        </button>
      </div>
    </form>
  );
}