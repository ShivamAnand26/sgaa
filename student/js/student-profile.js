/**
 * SGA.IN Student Portal - Student Profile Controller (student-profile.js)
 * Manages student academic details, in-browser canvas square avatar resizing,
 * password change, student data JSON export, and account deletion request.
 */

import { api } from '../../client/js/api.js';
import { ui } from '../../client/js/ui.js';
import { authGuard } from '../../client/js/auth-guard.js';

export async function initStudentProfile() {
  const user = await authGuard.protect('student');
  if (!user) return;

  ui.initDemoRibbon();
  ui.initMobileDrawer();
  ui.updateNotificationBadge();
  ui.updateCartBadge();

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

  // Populate form fields
  const nameInput = document.getElementById('prof-name');
  const emailInput = document.getElementById('prof-email');
  const phoneInput = document.getElementById('prof-phone');
  const collegeInput = document.getElementById('prof-college');
  const courseInput = document.getElementById('prof-course');
  const yearInput = document.getElementById('prof-year');

  if (nameInput) nameInput.value = user.fullName || '';
  if (emailInput) emailInput.value = user.email || '';
  if (phoneInput) phoneInput.value = user.phone || '';
  if (collegeInput) collegeInput.value = user.college || '';
  if (courseInput) courseInput.value = user.course || '';
  if (yearInput) yearInput.value = user.year || '';

  // 1. Profile Update Form
  const profileForm = document.getElementById('student-profile-form');
  profileForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('save-profile-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Saving...';
    }

    const res = await api.updateStudentProfile({
      fullName: nameInput?.value || '',
      phone: phoneInput?.value || '',
      college: collegeInput?.value || '',
      course: courseInput?.value || '',
      year: yearInput?.value || ''
    });

    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    }

    if (!res.ok) {
      ui.showToast(res.error || 'Failed to update profile.', 'error');
      return;
    }

    ui.showToast('Student profile updated successfully!', 'success');
    if (userNameEl) ui.setText(userNameEl, res.data.fullName);
  });

  // 2. In-browser Canvas Square Avatar Resizing
  const avatarFileInput = document.getElementById('avatar-file-input');
  avatarFileInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      ui.showToast('Please select a JPG or PNG image.', 'error');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      ui.showToast('Avatar file size must be under 2 MB.', 'error');
      return;
    }

    try {
      const resizedBlob = await resizeImageToSquare(file, 256);
      const uploadRes = await api.uploadAvatar(resizedBlob);
      if (uploadRes.ok) {
        ui.showToast('Avatar updated successfully!', 'success');
        const updatedUser = await api.getMe();
        if (updatedUser.ok) {
          ui.renderAvatar(headerAvatar, updatedUser.data);
          ui.renderAvatar(sidebarAvatar, updatedUser.data);
          ui.renderAvatar(profileAvatar, updatedUser.data);
        }
      } else {
        ui.showToast(uploadRes.error || 'Failed to upload avatar.', 'error');
      }
    } catch (err) {
      ui.showToast('Failed to process avatar image.', 'error');
    }
  });

  // 3. Password Change Form
  const passwordForm = document.getElementById('student-password-form');
  passwordForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPass = document.getElementById('curr-password')?.value || '';
    const newPass = document.getElementById('new-password')?.value || '';
    const confPass = document.getElementById('conf-new-password')?.value || '';

    if (!currentPass || !newPass) {
      ui.showToast('Please enter both your current and new password.', 'error');
      return;
    }

    if (newPass.length < 8) {
      ui.showToast('New password must be at least 8 characters long.', 'error');
      return;
    }

    if (newPass !== confPass) {
      ui.showToast('New passwords do not match.', 'error');
      return;
    }

    const btn = document.getElementById('change-password-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Updating Password...';
    }

    const res = await api.changePassword({
      currentPassword: currentPass,
      newPassword: newPass
    });

    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Change Password';
    }

    if (!res.ok) {
      ui.showToast(res.error || 'Failed to change password.', 'error');
      return;
    }

    ui.showToast('Password updated successfully!', 'success');
    passwordForm.reset();
  });

  // 4. Export Student Data (JSON)
  const exportBtn = document.getElementById('export-data-btn');
  exportBtn?.addEventListener('click', async () => {
    exportBtn.disabled = true;
    exportBtn.textContent = 'Exporting...';

    const res = await api.exportMyData();
    exportBtn.disabled = false;
    exportBtn.textContent = 'Export My Data (JSON)';

    if (!res.ok) {
      ui.showToast('Failed to export data.', 'error');
      return;
    }

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(res.data, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `SGA_Student_Data_${user.id}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    ui.showToast('Student data package downloaded.', 'success');
  });

  // 5. Account Deletion Request
  const deleteBtn = document.getElementById('request-delete-btn');
  deleteBtn?.addEventListener('click', async () => {
    const confirmed = await ui.showConfirm({
      title: 'Request Account Deletion',
      message: 'Are you sure you want to request account deletion? Your notes, library records, and payment history will be queued for administrative review.',
      confirmText: 'Request Deletion',
      isDanger: true
    });

    if (confirmed) {
      const res = await api.requestAccountDeletion();
      if (res.ok) {
        ui.showToast('Account deletion request submitted.', 'info');
      } else {
        ui.showToast(res.error || 'Request failed.', 'error');
      }
    }
  });
}

function resizeImageToSquare(file, targetSize = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = targetSize;
        canvas.height = targetSize;
        const ctx = canvas.getContext('2d');

        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;

        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, targetSize, targetSize);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob failed'));
        }, 'image/jpeg', 0.9);
      };
      img.onerror = () => reject(new Error('Image decode error'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsDataURL(file);
  });
}
