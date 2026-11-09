/**
 * SGA.IN Client Portal - Profile Controller (profile.js)
 * Manages profile editing, client-side canvas avatar resize & upload,
 * password change, data export as JSON, and account deletion request.
 */

import { api } from './api.js';
import { ui } from './ui.js';
import { authGuard } from './auth-guard.js';

export async function initProfile() {
  const user = await authGuard.protect();
  if (!user) return;

  ui.initDemoRibbon();
  ui.initMobileDrawer();
  ui.updateNotificationBadge();

  // Populate header and sidebar avatars
  const headerAvatar = document.getElementById('header-avatar');
  const sidebarAvatar = document.getElementById('sidebar-avatar');
  const profileAvatar = document.getElementById('profile-avatar-large');
  const userNameEl = document.getElementById('user-display-name');
  const userEmailEl = document.getElementById('user-display-email');
  if (userNameEl) ui.setText(userNameEl, user.fullName);
  if (userEmailEl) ui.setText(userEmailEl, user.email);

  ui.renderAvatar(headerAvatar, user);
  ui.renderAvatar(sidebarAvatar, user);
  ui.renderAvatar(profileAvatar, user);

  // Populate profile fields
  const nameInput = document.getElementById('prof-name');
  const emailInput = document.getElementById('prof-email');
  const phoneInput = document.getElementById('prof-phone');
  const addressInput = document.getElementById('prof-address');

  if (nameInput) nameInput.value = user.fullName || '';
  if (emailInput) emailInput.value = user.email || '';
  if (phoneInput) phoneInput.value = user.phone || '';
  if (addressInput) addressInput.value = user.address || '';

  // 1. Profile Form Submission
  const profileForm = document.getElementById('profile-info-form');
  const profileSubmitBtn = document.getElementById('prof-save-btn');
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fullName = nameInput.value.trim();
      const phone = phoneInput.value.trim();
      const address = addressInput.value.trim();

      if (!fullName || fullName.length < 2) {
        ui.showToast('Please provide your full name.', 'error');
        return;
      }
      if (!phone || phone.length < 8) {
        ui.showToast('Please provide a valid phone number.', 'error');
        return;
      }

      profileSubmitBtn.disabled = true;
      profileSubmitBtn.textContent = 'Saving changes...';

      const res = await api.updateProfile({ fullName, phone, address });
      profileSubmitBtn.disabled = false;
      profileSubmitBtn.textContent = 'Save Profile Changes';

      if (!res.ok) {
        ui.showToast(res.error || 'Failed to update profile.', 'error');
        return;
      }

      ui.showToast('Profile updated successfully.', 'success');
      if (userNameEl) ui.setText(userNameEl, res.data.fullName);
    });
  }

  // 2. Client-side Avatar Resizing & Upload via Canvas
  const avatarFileInput = document.getElementById('avatar-file-input');
  const avatarUploadBtn = document.getElementById('avatar-upload-trigger');
  if (avatarUploadBtn && avatarFileInput) {
    avatarUploadBtn.addEventListener('click', () => avatarFileInput.click());

    avatarFileInput.addEventListener('change', async () => {
      if (!avatarFileInput.files || avatarFileInput.files.length === 0) return;
      const file = avatarFileInput.files[0];

      if (file.size > 2 * 1024 * 1024) {
        ui.showToast('Avatar image must be under 2MB.', 'error');
        return;
      }

      if (!['image/jpeg', 'image/png'].includes(file.type)) {
        ui.showToast('Only JPG and PNG images are supported for avatars.', 'error');
        return;
      }

      ui.showToast('Optimizing avatar...', 'info');

      // Resize to 240x240 square in-browser with HTML5 Canvas
      const resizedBlob = await resizeImageToSquareBlob(file, 240);
      if (!resizedBlob) {
        ui.showToast('Could not process avatar image.', 'error');
        return;
      }

      const upRes = await api.uploadAvatar(resizedBlob);
      if (upRes.ok) {
        ui.showToast('Profile avatar updated.', 'success');
        user.avatarId = upRes.data.avatarId;
        ui.renderAvatar(profileAvatar, user);
        ui.renderAvatar(headerAvatar, user);
        ui.renderAvatar(sidebarAvatar, user);
      } else {
        ui.showToast(upRes.error, 'error');
      }

      avatarFileInput.value = '';
    });
  }

  // 3. Password Change Form
  const passwordForm = document.getElementById('change-password-form');
  const currentPassInput = document.getElementById('cur-password');
  const newPassInput = document.getElementById('new-password');
  const confPassInput = document.getElementById('conf-password');
  const passSubmitBtn = document.getElementById('pass-save-btn');

  if (passwordForm) {
    passwordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPassword = currentPassInput.value;
      const newPassword = newPassInput.value;
      const confirm = confPassInput.value;

      if (!currentPassword) {
        ui.showToast('Please enter your current password.', 'error');
        return;
      }
      if (newPassword.length < 8) {
        ui.showToast('New password must be at least 8 characters long.', 'error');
        return;
      }
      if (newPassword !== confirm) {
        ui.showToast('New passwords do not match.', 'error');
        return;
      }

      passSubmitBtn.disabled = true;
      passSubmitBtn.textContent = 'Updating...';

      const res = await api.changePassword({ currentPassword, newPassword });
      passSubmitBtn.disabled = false;
      passSubmitBtn.textContent = 'Change Password';

      if (!res.ok) {
        ui.showToast(res.error, 'error');
        return;
      }

      ui.showToast('Password changed successfully.', 'success');
      passwordForm.reset();
    });
  }

  // 4. Export Client Data as JSON
  const exportBtn = document.getElementById('export-data-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      exportBtn.disabled = true;
      exportBtn.textContent = 'Preparing export...';

      const res = await api.exportMyData();
      exportBtn.disabled = false;
      exportBtn.textContent = 'Export My Data (JSON)';

      if (!res.ok) {
        ui.showToast('Failed to export data.', 'error');
        return;
      }

      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sga_client_data_${user.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      ui.showToast('Client data export downloaded.', 'success');
    });
  }

  // 5. Danger Zone: Request Account Deletion
  const deleteBtn = document.getElementById('delete-account-btn');
  const deletionBanner = document.getElementById('deletion-pending-banner');

  if (user.deletionRequested && deletionBanner) {
    deletionBanner.style.display = 'block';
    if (deleteBtn) deleteBtn.disabled = true;
  }

  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      const confirmed = await ui.showConfirm({
        title: 'Request Account Deletion',
        message: 'Are you sure you wish to request deletion of your client account and all related project records? An administrator will review your request.',
        confirmText: 'Submit Deletion Request',
        cancelText: 'Keep Account',
        isDanger: true
      });

      if (confirmed) {
        const res = await api.requestAccountDeletion();
        if (res.ok) {
          ui.showToast('Account deletion request submitted.', 'info');
          if (deletionBanner) deletionBanner.style.display = 'block';
          deleteBtn.disabled = true;
        } else {
          ui.showToast(res.error, 'error');
        }
      }
    });
  }
}

/**
 * Resizes an image file to a square avatar blob using HTML5 Canvas
 */
async function resizeImageToSquareBlob(file, size = 240) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Center-crop to square
        const minDim = Math.min(img.width, img.height);
        const startX = (img.width - minDim) / 2;
        const startY = (img.height - minDim) / 2;

        ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, size, size);
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
      };
      img.onerror = () => resolve(null);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}
