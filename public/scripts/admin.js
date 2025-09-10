// Admin panel functionality
class AdminPanel {
    constructor() {
        this.stats = null;
        this.submissions = [];
        this.users = [];
        this.logs = [];
        this.selectedSubmissions = new Set();
        this.currentTab = 'submissions';
        this.init();
    }

    async init() {
        try {
            await this.loadStats();
            await this.loadSubmissions();
            this.setupEventListeners();
            this.updateUI();
        } catch (error) {
            console.error('Admin panel init error:', error);
            gamePlatform.showToast('Ошибка загрузки админ панели', 'error');
        }
    }

    async loadStats() {
        try {
            const response = await gamePlatform.apiRequest('/api/admin/stats');
            this.stats = response;
        } catch (error) {
            console.error('Load stats error:', error);
            throw error;
        }
    }

    async loadSubmissions(page = 1) {
        try {
            this.showLoading('submissionsLoading', true);
            
            const statusFilter = document.getElementById('submissionStatusFilter')?.value || '';
            const categoryFilter = document.getElementById('submissionCategoryFilter')?.value || '';
            
            const params = new URLSearchParams({
                page: page.toString(),
                limit: '20'
            });
            
            if (statusFilter) params.append('status', statusFilter);
            if (categoryFilter) params.append('category', categoryFilter);

            const response = await gamePlatform.apiRequest(`/api/admin/submissions?${params}`);
            this.submissions = response.submissions;
            this.submissionsPagination = response.pagination;
            
            this.renderSubmissions();
            this.renderPagination('submissions', this.submissionsPagination);
            this.clearSelection();
            
        } catch (error) {
            console.error('Load submissions error:', error);
            gamePlatform.showToast('Ошибка загрузки заявок', 'error');
        } finally {
            this.showLoading('submissionsLoading', false);
        }
    }

    async loadUsers(page = 1) {
        try {
            this.showLoading('usersLoading', true);
            
            const search = document.getElementById('userSearch')?.value || '';
            const roleFilter = document.getElementById('userRoleFilter')?.value || '';
            
            const params = new URLSearchParams({
                page: page.toString(),
                limit: '20'
            });
            
            if (search) params.append('search', search);
            if (roleFilter) params.append('role', roleFilter);

            const response = await gamePlatform.apiRequest(`/api/admin/users?${params}`);
            this.users = response.users;
            this.usersPagination = response.pagination;
            
            this.renderUsers();
            this.renderPagination('users', this.usersPagination);
            
        } catch (error) {
            console.error('Load users error:', error);
            gamePlatform.showToast('Ошибка загрузки пользователей', 'error');
        } finally {
            this.showLoading('usersLoading', false);
        }
    }

    async loadLogs(page = 1) {
        try {
            this.showLoading('logsLoading', true);
            
            const actionFilter = document.getElementById('logsActionFilter')?.value || '';
            
            const params = new URLSearchParams({
                page: page.toString(),
                limit: '50'
            });
            
            if (actionFilter) params.append('action', actionFilter);

            const response = await gamePlatform.apiRequest(`/api/admin/logs?${params}`);
            this.logs = response.logs;
            this.logsPagination = response.pagination;
            
            this.renderLogs();
            this.renderPagination('logs', this.logsPagination);
            
        } catch (error) {
            console.error('Load logs error:', error);
            gamePlatform.showToast('Ошибка загрузки логов', 'error');
        } finally {
            this.showLoading('logsLoading', false);
        }
    }

    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                this.switchTab(tab);
            });
        });

        // Filters
        document.getElementById('submissionStatusFilter')?.addEventListener('change', () => {
            this.loadSubmissions(1);
        });

        document.getElementById('submissionCategoryFilter')?.addEventListener('change', () => {
            this.loadSubmissions(1);
        });

        document.getElementById('userRoleFilter')?.addEventListener('change', () => {
            this.loadUsers(1);
        });

        document.getElementById('logsActionFilter')?.addEventListener('change', () => {
            this.loadLogs(1);
        });

        // Search with debounce
        let searchTimeout;
        document.getElementById('userSearch')?.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.loadUsers(1);
            }, 300);
        });
    }

    switchTab(tabName) {
        // Update active tab button
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update active tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });

        this.currentTab = tabName;

        // Load data for the active tab
        if (tabName === 'users' && !this.users.length) {
            this.loadUsers();
        } else if (tabName === 'logs' && !this.logs.length) {
            this.loadLogs();
        }
    }

    updateUI() {
        // Update admin name
        const adminName = document.getElementById('adminName');
        if (adminName && gamePlatform.user) {
            adminName.textContent = gamePlatform.user.nickname;
        }

        // Update stats
        if (this.stats) {
            document.getElementById('totalUsers').textContent = this.stats.overview.totalUsers;
            document.getElementById('totalSubmissions').textContent = this.stats.overview.totalSubmissions;
            document.getElementById('pendingSubmissions').textContent = this.stats.overview.pendingSubmissions;
            document.getElementById('totalPayouts').textContent = this.stats.overview.totalPayouts.toFixed(2);
        }
    }

    renderSubmissions() {
        const container = document.getElementById('submissionsTable');
        
        if (!this.submissions || this.submissions.length === 0) {
            container.innerHTML = '<div class="table-empty"><div class="empty-icon">📋</div><h3>Заявок нет</h3></div>';
            return;
        }

        const tableHTML = `
            <table class="admin-table">
                <thead>
                    <tr>
                        <th class="checkbox-cell">
                            <input type="checkbox" id="selectAll" onchange="adminPanel.toggleSelectAll()">
                        </th>
                        <th>Превью</th>
                        <th>Информация</th>
                        <th>Пользователь</th>
                        <th class="status-cell">Статус</th>
                        <th class="date-cell">Дата</th>
                        <th class="actions-cell">Действия</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.submissions.map(submission => this.renderSubmissionRow(submission)).join('')}
                </tbody>
            </table>
        `;
        
        container.innerHTML = tableHTML;
    }

    renderSubmissionRow(submission) {
        const statusClass = `status-${submission.status.toLowerCase()}`;
        const statusText = {
            'PENDING': 'На рассмотрении',
            'APPROVED': 'Одобрено',
            'REJECTED': 'Отклонено'
        }[submission.status];

        const isImage = submission.fileType === 'IMAGE';
        const mediaElement = isImage 
            ? `<img src="${submission.fileUrl}" class="submission-preview-small" alt="Preview">`
            : `<video src="${submission.fileUrl}" class="submission-preview-small" muted></video>`;

        return `
            <tr class="${this.selectedSubmissions.has(submission.id) ? 'selected' : ''}">
                <td class="checkbox-cell">
                    <input type="checkbox" value="${submission.id}" 
                           ${this.selectedSubmissions.has(submission.id) ? 'checked' : ''}
                           onchange="adminPanel.toggleSubmissionSelection('${submission.id}')">
                </td>
                <td>${mediaElement}</td>
                <td>
                    <div class="submission-info-compact">
                        <div class="submission-category-small">${submission.category}</div>
                        ${submission.description ? `<div class="submission-description-small">${submission.description}</div>` : ''}
                    </div>
                </td>
                <td>
                    <div class="user-info-compact">
                        <div class="user-avatar">${submission.user.nickname.charAt(0).toUpperCase()}</div>
                        <div class="user-details">
                            <div class="user-nickname">${submission.user.nickname}</div>
                            <div class="user-meta">Баланс: ${submission.user.balance.toFixed(2)}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </td>
                <td class="date-cell">
                    ${gamePlatform.formatDate(submission.createdAt)}
                </td>
                <td>
                    <div class="table-actions">
                        <button class="btn-table btn-view" onclick="adminPanel.viewSubmission('${submission.id}')">
                            👁️ Просмотр
                        </button>
                        ${submission.status === 'PENDING' ? `
                            <button class="btn-table btn-approve" onclick="adminPanel.quickApprove('${submission.id}')">
                                ✅ Одобрить
                            </button>
                            <button class="btn-table btn-reject" onclick="adminPanel.quickReject('${submission.id}')">
                                ❌ Отклонить
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }

    renderUsers() {
        const container = document.getElementById('usersTable');
        
        if (!this.users || this.users.length === 0) {
            container.innerHTML = '<div class="table-empty"><div class="empty-icon">👥</div><h3>Пользователей нет</h3></div>';
            return;
        }

        const tableHTML = `
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Пользователь</th>
                        <th>Роль</th>
                        <th>Баланс</th>
                        <th>Заявки</th>
                        <th>Статус</th>
                        <th class="date-cell">Регистрация</th>
                        <th class="actions-cell">Действия</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.users.map(user => this.renderUserRow(user)).join('')}
                </tbody>
            </table>
        `;
        
        container.innerHTML = tableHTML;
    }

    renderUserRow(user) {
        const roleClass = `role-${user.role.toLowerCase()}`;
        const roleText = {
            'USER': 'Пользователь',
            'MODERATOR': 'Модератор',
            'ADMIN': 'Админ'
        }[user.role];

        return `
            <tr>
                <td>
                    <div class="user-info-compact">
                        <div class="user-avatar">${user.nickname.charAt(0).toUpperCase()}</div>
                        <div class="user-details">
                            <div class="user-nickname">${user.nickname}</div>
                            <div class="user-meta">ID: ${user.epicId.slice(-8)}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="role-badge ${roleClass}">${roleText}</span>
                </td>
                <td>
                    <span class="balance-display ${user.balance < 0 ? 'balance-negative' : ''}">
                        ${user.balance.toFixed(2)}
                    </span>
                </td>
                <td>
                    <div class="user-stats">
                        <div>Заявок: ${user._count.submissions}</div>
                        <div>Выплат: ${user._count.payouts}</div>
                    </div>
                </td>
                <td>
                    <div class="status-indicator">
                        <div class="status-dot ${user.isBanned ? 'banned' : 'online'}"></div>
                        ${user.isBanned ? 'Заблокирован' : 'Активен'}
                    </div>
                </td>
                <td class="date-cell">
                    ${gamePlatform.formatDate(user.createdAt)}
                </td>
                <td>
                    <div class="table-actions">
                        <button class="btn-table btn-edit" onclick="adminPanel.editUser('${user.id}')">
                            ✏️ Изменить
                        </button>
                        <button class="btn-table btn-balance" onclick="adminPanel.addBalance('${user.id}')">
                            💰 Баланс
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }

    renderLogs() {
        const container = document.getElementById('logsTable');
        
        if (!this.logs || this.logs.length === 0) {
            container.innerHTML = '<div class="table-empty"><div class="empty-icon">📝</div><h3>Логов нет</h3></div>';
            return;
        }

        const tableHTML = `
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Администратор</th>
                        <th>Действие</th>
                        <th>Детали</th>
                        <th class="date-cell">Дата</th>
                        <th class="hide-mobile">IP</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.logs.map(log => this.renderLogRow(log)).join('')}
                </tbody>
            </table>
        `;
        
        container.innerHTML = tableHTML;
    }

    renderLogRow(log) {
        const actionText = {
            'REVIEW_SUBMISSION': 'Модерация заявки',
            'ADD_BALANCE': 'Добавление баланса',
            'UPDATE_USER': 'Обновление пользователя',
            'BULK_REVIEW_SUBMISSIONS': 'Массовая модерация'
        }[log.action] || log.action;

        return `
            <tr>
                <td>${log.admin.nickname}</td>
                <td>
                    <div class="log-entry">
                        <div class="log-action">${actionText}</div>
                    </div>
                </td>
                <td>
                    <div class="log-details">${log.details}</div>
                </td>
                <td class="date-cell">
                    ${gamePlatform.formatDate(log.createdAt)}
                </td>
                <td class="hide-mobile">
                    <div class="log-meta">${log.ipAddress || 'N/A'}</div>
                </td>
            </tr>
        `;
    }

    renderPagination(type, pagination) {
        const container = document.getElementById(`${type}Pagination`);
        if (!container || !pagination || pagination.pages <= 1) {
            container.innerHTML = '';
            return;
        }

        const { page, pages, total } = pagination;
        let paginationHTML = '';

        // Previous button
        paginationHTML += `
            <button class="pagination-btn ${page <= 1 ? 'disabled' : ''}" 
                    onclick="adminPanel.load${type.charAt(0).toUpperCase() + type.slice(1,-1)}(${page - 1})" 
                    ${page <= 1 ? 'disabled' : ''}>
                ← Назад
            </button>
        `;

        // Page numbers
        const startPage = Math.max(1, page - 2);
        const endPage = Math.min(pages, page + 2);

        for (let i = startPage; i <= endPage; i++) {
            paginationHTML += `
                <button class="pagination-btn ${i === page ? 'active' : ''}" 
                        onclick="adminPanel.load${type.charAt(0).toUpperCase() + type.slice(1,-1)}(${i})">
                    ${i}
                </button>
            `;
        }

        // Next button
        paginationHTML += `
            <button class="pagination-btn ${page >= pages ? 'disabled' : ''}" 
                    onclick="adminPanel.load${type.charAt(0).toUpperCase() + type.slice(1,-1)}(${page + 1})" 
                    ${page >= pages ? 'disabled' : ''}>
                Далее →
            </button>
        `;

        container.innerHTML = `
            <div class="pagination-info">
                <div class="pagination-summary">
                    Показано ${total} записей, страница ${page} из ${pages}
                </div>
                <div class="pagination-controls">
                    ${paginationHTML}
                </div>
            </div>
        `;
    }

    showLoading(elementId, show) {
        const loading = document.getElementById(elementId);
        if (loading) {
            loading.classList.toggle('hidden', !show);
        }
    }

    // Selection Management
    toggleSelectAll() {
        const selectAll = document.getElementById('selectAll');
        const checkboxes = document.querySelectorAll('#submissionsTable input[type="checkbox"]:not(#selectAll)');
        
        if (selectAll.checked) {
            checkboxes.forEach(cb => {
                cb.checked = true;
                this.selectedSubmissions.add(cb.value);
            });
        } else {
            checkboxes.forEach(cb => {
                cb.checked = false;
            });
            this.selectedSubmissions.clear();
        }
        
        this.updateBulkActions();
    }

    toggleSubmissionSelection(submissionId) {
        if (this.selectedSubmissions.has(submissionId)) {
            this.selectedSubmissions.delete(submissionId);
        } else {
            this.selectedSubmissions.add(submissionId);
        }
        
        // Update select all checkbox
        const selectAll = document.getElementById('selectAll');
        const totalCheckboxes = document.querySelectorAll('#submissionsTable input[type="checkbox"]:not(#selectAll)').length;
        
        if (selectAll) {
            selectAll.checked = this.selectedSubmissions.size === totalCheckboxes;
            selectAll.indeterminate = this.selectedSubmissions.size > 0 && this.selectedSubmissions.size < totalCheckboxes;
        }
        
        this.updateBulkActions();
    }

    clearSelection() {
        this.selectedSubmissions.clear();
        this.updateBulkActions();
        
        const selectAll = document.getElementById('selectAll');
        if (selectAll) {
            selectAll.checked = false;
            selectAll.indeterminate = false;
        }
    }

    updateBulkActions() {
        const bulkActions = document.getElementById('bulkActions');
        const selectedCount = document.getElementById('selectedCount');
        
        if (bulkActions && selectedCount) {
            if (this.selectedSubmissions.size > 0) {
                selectedCount.textContent = this.selectedSubmissions.size;
                bulkActions.style.display = 'flex';
            } else {
                bulkActions.style.display = 'none';
            }
        }
    }

    // Submission Actions
    async viewSubmission(submissionId) {
        try {
            gamePlatform.showLoading('Загрузка заявки...');
            
            const submission = this.submissions.find(s => s.id === submissionId);
            if (!submission) return;
            
            const modal = document.getElementById('reviewModal');
            const content = document.getElementById('reviewContent');
            
            const isImage = submission.fileType === 'IMAGE';
            const mediaElement = isImage 
                ? `<img src="${submission.fileUrl}" alt="Submission">`
                : `<video src="${submission.fileUrl}" controls></video>`;

            content.innerHTML = `
                <div class="review-content">
                    <div class="review-media">
                        ${mediaElement}
                    </div>
                    <div class="review-details">
                        <div class="review-field">
                            <label>Пользователь:</label>
                            <div class="value">${submission.user.nickname}</div>
                        </div>
                        <div class="review-field">
                            <label>Категория:</label>
                            <div class="value">${submission.category}</div>
                        </div>
                        ${submission.description ? `
                            <div class="review-field">
                                <label>Описание:</label>
                                <div class="value">${submission.description}</div>
                            </div>
                        ` : ''}
                        <div class="review-field">
                            <label>Размер файла:</label>
                            <div class="value">${gamePlatform.formatFileSize(submission.fileSize)}</div>
                        </div>
                        <div class="review-field">
                            <label>Дата создания:</label>
                            <div class="value">${gamePlatform.formatDate(submission.createdAt)}</div>
                        </div>
                        ${submission.status !== 'PENDING' ? `
                            <div class="review-field">
                                <label>Статус:</label>
                                <div class="value">
                                    <span class="status-badge status-${submission.status.toLowerCase()}">
                                        ${{'APPROVED': 'Одобрено', 'REJECTED': 'Отклонено'}[submission.status]}
                                    </span>
                                </div>
                            </div>
                            ${submission.reviewer ? `
                                <div class="review-field">
                                    <label>Модератор:</label>
                                    <div class="value">${submission.reviewer.nickname}</div>
                                </div>
                            ` : ''}
                            ${submission.rejectReason ? `
                                <div class="review-field">
                                    <label>Причина отклонения:</label>
                                    <div class="value">${submission.rejectReason}</div>
                                </div>
                            ` : ''}
                        ` : ''}
                    </div>
                </div>
                ${submission.status === 'PENDING' ? `
                    <div class="review-form">
                        <div class="form-group">
                            <label class="form-label" for="reviewAction">Действие</label>
                            <select id="reviewAction" class="form-select" onchange="adminPanel.toggleRejectReason()">
                                <option value="">Выберите действие</option>
                                <option value="APPROVED">Одобрить</option>
                                <option value="REJECTED">Отклонить</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="bonusAmount">Бонус (необязательно)</label>
                            <input type="number" id="bonusAmount" class="form-input" 
                                   step="0.01" min="0" max="1000" placeholder="0.00">
                        </div>
                        <div class="form-group full-width" id="rejectReasonGroup" style="display: none;">
                            <label class="form-label" for="rejectReason">Причина отклонения *</label>
                            <textarea id="rejectReason" class="form-input form-textarea" 
                                      placeholder="Укажите причину отклонения" maxlength="200"></textarea>
                        </div>
                        <div class="review-actions full-width">
                            <button class="btn btn-primary" onclick="adminPanel.submitReview('${submissionId}')">
                                Применить
                            </button>
                        </div>
                    </div>
                ` : ''}
            `;
            
            gamePlatform.showModal('reviewModal');
            
        } catch (error) {
            console.error('View submission error:', error);
            gamePlatform.showToast('Ошибка загрузки заявки', 'error');
        } finally {
            gamePlatform.hideLoading();
        }
    }

    toggleRejectReason() {
        const action = document.getElementById('reviewAction').value;
        const rejectGroup = document.getElementById('rejectReasonGroup');
        
        if (rejectGroup) {
            rejectGroup.style.display = action === 'REJECTED' ? 'block' : 'none';
        }
    }

    async submitReview(submissionId) {
        try {
            const action = document.getElementById('reviewAction').value;
            const bonusAmount = parseFloat(document.getElementById('bonusAmount').value) || 0;
            const rejectReason = document.getElementById('rejectReason').value;
            
            if (!action) {
                gamePlatform.showToast('Выберите действие', 'error');
                return;
            }
            
            if (action === 'REJECTED' && !rejectReason) {
                gamePlatform.showToast('Укажите причину отклонения', 'error');
                return;
            }
            
            gamePlatform.showLoading('Сохранение...');
            
            const payload = {
                status: action,
                bonusAmount: bonusAmount
            };
            
            if (action === 'REJECTED') {
                payload.rejectReason = rejectReason;
            }
            
            await gamePlatform.apiRequest(`/api/admin/submissions/${submissionId}/review`, {
                method: 'PATCH',
                body: JSON.stringify(payload)
            });
            
            gamePlatform.showToast('Заявка успешно рассмотрена!', 'success');
            gamePlatform.closeModal('reviewModal');
            
            await this.loadSubmissions();
            await this.loadStats();
            this.updateUI();
            
        } catch (error) {
            console.error('Submit review error:', error);
            gamePlatform.showToast('Ошибка при рассмотрении заявки', 'error');
        } finally {
            gamePlatform.hideLoading();
        }
    }

    async quickApprove(submissionId) {
        try {
            gamePlatform.showLoading('Одобрение...');
            
            await gamePlatform.apiRequest(`/api/admin/submissions/${submissionId}/review`, {
                method: 'PATCH',
                body: JSON.stringify({ status: 'APPROVED' })
            });
            
            gamePlatform.showToast('Заявка одобрена!', 'success');
            
            await this.loadSubmissions();
            await this.loadStats();
            this.updateUI();
            
        } catch (error) {
            console.error('Quick approve error:', error);
            gamePlatform.showToast('Ошибка одобрения', 'error');
        } finally {
            gamePlatform.hideLoading();
        }
    }

    async quickReject(submissionId) {
        const reason = prompt('Причина отклонения:');
        if (!reason) return;
        
        try {
            gamePlatform.showLoading('Отклонение...');
            
            await gamePlatform.apiRequest(`/api/admin/submissions/${submissionId}/review`, {
                method: 'PATCH',
                body: JSON.stringify({ 
                    status: 'REJECTED',
                    rejectReason: reason
                })
            });
            
            gamePlatform.showToast('Заявка отклонена!', 'success');
            
            await this.loadSubmissions();
            await this.loadStats();
            this.updateUI();
            
        } catch (error) {
            console.error('Quick reject error:', error);
            gamePlatform.showToast('Ошибка отклонения', 'error');
        } finally {
            gamePlatform.hideLoading();
        }
    }

    // Bulk Actions
    async bulkApprove() {
        if (this.selectedSubmissions.size === 0) return;
        
        if (!confirm(`Одобрить ${this.selectedSubmissions.size} заявок?`)) return;
        
        try {
            gamePlatform.showLoading('Массовое одобрение...');
            
            await gamePlatform.apiRequest('/api/admin/submissions/bulk-review', {
                method: 'PATCH',
                body: JSON.stringify({
                    submissionIds: Array.from(this.selectedSubmissions),
                    status: 'APPROVED'
                })
            });
            
            gamePlatform.showToast('Заявки одобрены!', 'success');
            
            await this.loadSubmissions();
            await this.loadStats();
            this.updateUI();
            
        } catch (error) {
            console.error('Bulk approve error:', error);
            gamePlatform.showToast('Ошибка массового одобрения', 'error');
        } finally {
            gamePlatform.hideLoading();
        }
    }

    bulkReject() {
        if (this.selectedSubmissions.size === 0) return;
        
        gamePlatform.showModal('bulkRejectModal');
    }

    async confirmBulkReject() {
        const reason = document.getElementById('bulkRejectReason').value;
        if (!reason) {
            gamePlatform.showToast('Укажите причину отклонения', 'error');
            return;
        }
        
        try {
            gamePlatform.showLoading('Массовое отклонение...');
            
            await gamePlatform.apiRequest('/api/admin/submissions/bulk-review', {
                method: 'PATCH',
                body: JSON.stringify({
                    submissionIds: Array.from(this.selectedSubmissions),
                    status: 'REJECTED',
                    rejectReason: reason
                })
            });
            
            gamePlatform.showToast('Заявки отклонены!', 'success');
            gamePlatform.closeModal('bulkRejectModal');
            
            // Reset form
            document.getElementById('bulkRejectForm').reset();
            
            await this.loadSubmissions();
            await this.loadStats();
            this.updateUI();
            
        } catch (error) {
            console.error('Bulk reject error:', error);
            gamePlatform.showToast('Ошибка массового отклонения', 'error');
        } finally {
            gamePlatform.hideLoading();
        }
    }

    // User Management
    editUser(userId) {
        const user = this.users.find(u => u.id === userId);
        if (!user) return;
        
        // Fill form
        document.getElementById('editUserId').value = user.id;
        document.getElementById('editUserNickname').value = user.nickname;
        document.getElementById('editUserRole').value = user.role;
        document.getElementById('editUserBalance').value = user.balance;
        document.getElementById('editUserBanned').checked = user.isBanned;
        
        gamePlatform.showModal('userEditModal');
    }

    async saveUserChanges() {
        try {
            const form = document.getElementById('userEditForm');
            const formData = new FormData(form);
            const userId = formData.get('userId');
            
            const updates = {
                role: formData.get('role'),
                balance: parseFloat(formData.get('balance')),
                isBanned: formData.get('isBanned') === 'on'
            };
            
            gamePlatform.showLoading('Сохранение...');
            
            await gamePlatform.apiRequest(`/api/admin/users/${userId}`, {
                method: 'PATCH',
                body: JSON.stringify(updates)
            });
            
            gamePlatform.showToast('Пользователь обновлен!', 'success');
            gamePlatform.closeModal('userEditModal');
            
            await this.loadUsers();
            
        } catch (error) {
            console.error('Save user error:', error);
            gamePlatform.showToast('Ошибка сохранения пользователя', 'error');
        } finally {
            gamePlatform.hideLoading();
        }
    }

    addBalance(userId) {
        const user = this.users.find(u => u.id === userId);
        if (!user) return;
        
        // Fill form
        document.getElementById('balanceUserId').value = user.id;
        document.getElementById('balanceUserNickname').value = user.nickname;
        document.getElementById('balanceAmount').value = '';
        document.getElementById('balanceReason').value = '';
        
        gamePlatform.showModal('addBalanceModal');
    }

    async addUserBalance() {
        try {
            const form = document.getElementById('addBalanceForm');
            const formData = new FormData(form);
            const userId = formData.get('userId');
            const amount = parseFloat(formData.get('amount'));
            const reason = formData.get('reason');
            
            if (!amount || amount <= 0) {
                gamePlatform.showToast('Введите корректную сумму', 'error');
                return;
            }
            
            if (!reason) {
                gamePlatform.showToast('Укажите причину', 'error');
                return;
            }
            
            gamePlatform.showLoading('Добавление баланса...');
            
            await gamePlatform.apiRequest(`/api/admin/users/${userId}/add-balance`, {
                method: 'POST',
                body: JSON.stringify({ amount, reason })
            });
            
            gamePlatform.showToast('Баланс добавлен!', 'success');
            gamePlatform.closeModal('addBalanceModal');
            
            // Reset form
            form.reset();
            
            await this.loadUsers();
            await this.loadStats();
            this.updateUI();
            
        } catch (error) {
            console.error('Add balance error:', error);
            gamePlatform.showToast('Ошибка добавления баланса', 'error');
        } finally {
            gamePlatform.hideLoading();
        }
    }
}

// Initialize admin panel
const adminPanel = new AdminPanel();

// Export for global use
window.adminPanel = adminPanel;