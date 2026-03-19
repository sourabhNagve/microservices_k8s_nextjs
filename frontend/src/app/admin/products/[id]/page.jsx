'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, X } from 'lucide-react';
import { getToken } from '@/lib/auth';
import { useToast } from '@/components/Toast';

const PRODUCT_API = process.env.NEXT_PUBLIC_PRODUCT_SERVICE_URL || 'http://localhost:3003';

const CATEGORIES = [
  { value: '1', label: 'Electronics' },
  { value: '2', label: 'Clothing' },
  { value: '3', label: 'Books' },
  { value: '4', label: 'Home & Garden' },
  { value: '5', label: 'Sports' },
];

const Field = ({ label, required, error, children }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
      {label}{required && <span className="text-red-500 ml-1">*</span>}
    </label>
    {children}
    {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
  </div>
);

const inputClass = (hasError) =>
  `w-full px-3 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white ${
    hasError
      ? 'border-red-400 dark:border-red-600'
      : 'border-gray-200 dark:border-gray-700'
  }`;

export default function NewProductPage() {
  const router = useRouter();
  const toast  = useToast();

  const [loading, setLoading] = useState(false);
  const [errors,  setErrors]  = useState({});
  const [imageInput, setImageInput] = useState('');

  const [form, setForm] = useState({
    name:        '',
    description: '',
    price:       '',
    sku:         '',
    categoryId:  '',
    stock:       '',
    weight:      '',
    status:      'active',
    images:      [],
  });

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const addImage = () => {
    const url = imageInput.trim();
    if (!url) return;
    if (form.images.includes(url)) {
      toast.error('Image URL already added');
      return;
    }
    setField('images', [...form.images, url]);
    setImageInput('');
  };

  const removeImage = (url) => {
    setField('images', form.images.filter((i) => i !== url));
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim())  e.name  = 'Name is required';
    if (!form.price)        e.price = 'Price is required';
    if (isNaN(parseFloat(form.price)) || parseFloat(form.price) < 0)
      e.price = 'Price must be a valid positive number';
    if (!form.categoryId)   e.categoryId = 'Category is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const token = getToken();
      const res   = await fetch(`${PRODUCT_API}/api/products`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${token}`,
        },
        body: JSON.stringify({
          name:        form.name.trim(),
          description: form.description.trim(),
          price:       parseFloat(form.price),
          sku:         form.sku.trim() || undefined,
          categoryId:  form.categoryId,
          stock:       form.stock ? parseInt(form.stock) : undefined,
          weight:      form.weight ? parseFloat(form.weight) : undefined,
          status:      form.status,
          images:      form.images,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }

      toast.success('Product created successfully!');
      router.push('/admin/products');
    } catch (err) {
      toast.error(err.message ?? 'Failed to create product');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/products" className="text-gray-500 hover:text-gray-900 dark:hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Add New Product</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 space-y-5">
          <h2 className="font-semibold text-gray-900 dark:text-white">Basic Information</h2>

          <Field label="Product Name" required error={errors.name}>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              className={inputClass(!!errors.name)}
              placeholder="e.g. Wireless Headphones"
            />
          </Field>

          <Field label="Description">
            <textarea
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              rows={4}
              className={`${inputClass(false)} resize-none`}
              placeholder="Describe the product…"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Price ($)" required error={errors.price}>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => setField('price', e.target.value)}
                className={inputClass(!!errors.price)}
                placeholder="29.99"
              />
            </Field>

            <Field label="SKU">
              <input
                type="text"
                value={form.sku}
                onChange={(e) => setField('sku', e.target.value)}
                className={inputClass(false)}
                placeholder="PRD-001"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Category" required error={errors.categoryId}>
              <select
                value={form.categoryId}
                onChange={(e) => setField('categoryId', e.target.value)}
                className={inputClass(!!errors.categoryId)}
              >
                <option value="">Select category</option>
                {CATEGORIES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Field>

            <Field label="Status">
              <select
                value={form.status}
                onChange={(e) => setField('status', e.target.value)}
                className={inputClass(false)}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Stock Quantity">
              <input
                type="number"
                min="0"
                value={form.stock}
                onChange={(e) => setField('stock', e.target.value)}
                className={inputClass(false)}
                placeholder="100"
              />
            </Field>

            <Field label="Weight (lbs)">
              <input
                type="number"
                min="0"
                step="0.1"
                value={form.weight}
                onChange={(e) => setField('weight', e.target.value)}
                className={inputClass(false)}
                placeholder="1.5"
              />
            </Field>
          </div>
        </div>

        {/* Images */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 dark:text-white">Product Images</h2>

          <div className="flex gap-2">
            <input
              type="url"
              value={imageInput}
              onChange={(e) => setImageInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addImage())}
              className={`${inputClass(false)} flex-1`}
              placeholder="https://example.com/image.jpg"
            />
            <button
              type="button"
              onClick={addImage}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>

          {form.images.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {form.images.map((url, i) => (
                <div key={i} className="relative group">
                  <img
                    src={url}
                    alt={`Product image ${i + 1}`}
                    className="w-full h-24 object-cover rounded-xl border border-gray-200 dark:border-gray-700"
                    onError={(e) => { e.target.src = ''; e.target.style.display = 'none'; }}
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(url)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Link
            href="/admin/products"
            className="px-5 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
              : <><Plus className="w-4 h-4" /> Create Product</>}
          </button>
        </div>
      </form>
    </div>
  );
}