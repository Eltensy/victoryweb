// Dashboard functionality
class Dashboard {
    constructor() {
        this.user = null;
        this.categories = [];
        this.submissions = [];
        this.currentPage = 1;
        this.currentTab = 'submissions';
        this.init();
    }

    async init() {
        try {
            await this.loadUserData();
            await this.loadCategories();
            await this.loadSubmissions();
            this.setupEventListeners();
            this.updateUI();
        } catch (error) {
            console.error('Dashboard init error:', error);
            gamePlatform.showToast('Ошибка загрузки панели управления', 'error');
        }
    }

    async loadUserData() {
        try {
            const response = await gamePlatform.apiRequest('/api/user/dashboard');
            this.user = response.user;
            this.stats = response.stats;
            this.recentSubmissions = response.recentSubmissions;
            this.recentPayouts = response.recentPayouts;
        } catch (error) {
            console.error('Load user data error:', error);
            throw error;
        }
    }

    async loadCategories() {
        try {
            const response = await gamePlatform.apiRequest('/api/submissions/meta/categories');
            this.categories = response.all || [];
        } catch (error) {
            console.error('Load categories error:', error);
            this.categories = [
                'Victory Royale', 'Epic Kill', 'Funny Moment', 'Clutch Play',
                'Bug/Glitch', 'Creative Build', 'Trick Shot', 'Team Play'
            ];
        }
    }

    async loadSubmissions(page = 1) {
        try {
            this.showSubmissionsLoading(true);
            
            const statusFilter = document.getElementById('statusFilter')?.value || '';
            const params = new URLSearchParams({
                page: page.toString(),
                limit: '12'
            });
            
            if (statusFilter) {
                params.append('status', statusFilter);
            }

            const response = await gamePlatform.apiRequest(`/api/submissions?${params}`);
            this.submissions = response.submissions;
            this.pagination = response.pagination;
            this.currentPage = page;
            
            this.renderSubmissions();
            this.renderPagination();
        } catch (error) {
            console.error('Load submissions error:', error);
            gamePlatform.showToast('Ошибка загрузки заявок', 'error');
        } finally {
            this.showSubmissionsLoading(false);
        }
    }

    async loadPayouts(page = 1) {
        try {
            const response = await gamePlatform.apiRequest(`/api/user/payouts?page=${page}&limit=20`);
            this.payouts = response.payouts;
            this.payoutsPagination = response.pagination;
            
            this.renderPayouts();
        } catch (error) {
            console.error('Load payouts error:', error);
            gamePlatform.showToast('Ошибка загрузки истории выплат', 'error');
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

        // Status filter
        document.getElementById('statusFilter')?.addEventListener('change', () => {
            this.loadSubmissions(1);
        });

        // File upload
        this.setupFileUpload();

        // Form submission
        document.getElementById('submissionForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitForm();
        });
    }

    setupFileUpload() {
        const fileUpload = document.getElementById('fileUpload');
        const fileInput = document.getElementById('file');
        const filePreview = document.getElementById('filePreview');

        if (!fileUpload || !fileInput) return;

        // Click to upload
        fileUpload.addEventListener('click', () => {
            fileInput.click();
        });

        // Drag and drop
        fileUpload.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileUpload.classList.add('drag-over');
        });

        fileUpload.addEventListener('dragleave', () => {
            fileUpload.classList.remove('drag-over');
        });

        fileUpload.addEventListener('drop', (e) => {
            e.preventDefault();
            fileUpload.classList.remove('drag-over');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                fileInput.files = files;
                this.handleFileSelect(files[0]);
            }
        });

        // File selection
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFileSelect(e.target.files[0]);
            }
        });
    }

    handleFileSelect(file) {
        const filePreview = document.getElementById('filePreview');
        const maxSize = 100 * 1024 * 1024; // 100MB

        // Validate file size
        if (file.size > maxSize) {
            gamePlatform.showToast('Файл слишком большой. Максимальный размер: 100 МБ', 'error');
            return;
        }

        // Validate file type
        const allowedTypes = ['image/', 'video/'];
        if (!allowedTypes.some(type => file.type.startsWith(type))) {
            gamePlatform.showToast('Недопустимый тип файла. Разрешены только изображения и видео', 'error');
            return;
        }

        // Show preview
        const reader = new FileReader();
        reader.onload = (e) => {
            const isImage = file.type.startsWith('image/');
            const element = isImage ? 'img' : 'video';
            const controls = isImage ? '' : 'controls';

            filePreview.innerHTML = `
                <div class="file-preview-content">
                    <${element} src="${e.target.result}" class="file-preview-image" ${controls}></${element}>
                    <div class="file-preview-info">
                        <div class="file-preview-name">${file.name}</div>
                        <div class="file-preview-details">
                            ${this.formatFileSize(file.size)} • ${file.type}
                        </div>
                    </div>
                    <button type="button" class="file-preview-remove" onclick="dashboard.removeFile()">
                        🗑️
                    </button>
                </div>
            `;
            filePreview.classList.remove('hidden');
        };

        reader.readAsDataURL(file);
    }

    removeFile() {
        const fileInput = document.getElementById('file');
        const filePreview = document.getElementById('filePreview');
        
        fileInput.value = '';
        filePreview.innerHTML = '';
        filePreview.classList.add('hidden');
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
        if (tabName === 'payouts' && !this.payouts) {
            this.loadPayouts();
        }
    }

    updateUI() {
        // Update welcome message
        const welcomeTitle = document.getElementById('welcomeTitle');
        if (welcomeTitle && this.user) {
            welcomeTitle.textContent = `Добро пожаловать, ${this.user.nickname}!`;
        }

        // Update balance
        const balanceAmount = document.getElementById('balanceAmount');
        if (balanceAmount && this.user) {
            balanceAmount.textContent = this.user.balance.toFixed(2);
        }

        // Update stats
        if (this.stats) {
            document.getElementById('totalSubmissions').textContent = this.stats.total;
            document.getElementById('pendingSubmissions').textContent = this.stats.pending;
            document.getElementById('approvedSubmissions').textContent = this.stats.approved;
            document.getElementById('totalEarnings').textContent = this.user.balance.toFixed(2);
        }

        // Update categories dropdown
        const categorySelect = document.getElementById('category');
        if (categorySelect && this.categories.length > 0) {
            categorySelect.innerHTML = '<option value="">Выберите категорию</option>' +
                this.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
        }
    }

    renderSubmissions() {
        const grid = document.getElementById('submissionsGrid');
        const empty = document.getElementById('submissionsEmpty');

        if (!this.submissions || this.submissions.length === 0) {
            grid.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }

        empty.classList.add('hidden');
        grid.innerHTML = this.submissions.map(submission => this.renderSubmissionCard(submission)).join('');
    }

    renderSubmissionCard(submission) {
        const statusClass = `status-${submission.status.toLowerCase()}`;
        const statusText = {
            'PENDING': 'На рассмотрении',
            'APPROVED': 'Одобрено',
            'REJECTED': 'Отклонено'
        }[submission.status];

        const fileUrl = submission.fileUrl;
        const isImage = submission.fileType === 'IMAGE';
        const mediaElement = isImage 
            ? `<img src="${fileUrl}" alt="Submission" loading="lazy">`
            : `<video src="${fileUrl}" muted></video>`;

        return `
            <div class="submission-card" onclick="dashboard.showSubmissionDetails('${submission.id}')">
                <div class="submission-preview">
                    ${mediaElement}
                    <div class="file-type-badge">${submission.fileType}</div>
                </div>
                <div class="submission-info">
                    <div class="submission-header">
                        <div class="submission-category">${submission.category}</div>
                        <div class="status-badge ${statusClass}">${statusText}</div>
                    </div>
                    ${submission.description ? `<div class="submission-description">${submission.description}</div>` : ''}
                    <div class="submission-meta">
                        <span>${gamePlatform.formatDate(submission.createdAt)}</span>
                        <span>${gamePlatform.formatFileSize(submission.fileSize)}</span>
                    </div>
                    ${submission.status === 'PENDING' ? `
                        <div class="submission-actions">
                            <button class="btn btn-danger btn-small" onclick="event.stopPropagation(); dashboard.deleteSubmission('${submission.id}')">
                                Удалить
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    renderPagination() {
        const container = document.getElementById('submissionsPagination');
        if (!container || !this.pagination) return;

        const { page, pages, total } = this.pagination;
        
        if (pages <= 1) {
            container.innerHTML = '';
            return;
        }

        let paginationHTML = '';

        // Previous button
        paginationHTML += `
            <button class="pagination-btn ${page <= 1 ? 'disabled' : ''}" 
                    onclick="dashboard.loadSubmissions(${page - 1})" 
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
                        onclick="dashboard.loadSubmissions(${i})">
                    ${i}
                </button>
            `;
        }

        // Next button
        paginationHTML += `
            <button class="pagination-btn ${page >= pages ? 'disabled' : ''}" 
                    onclick="dashboard.loadSubmissions(${page + 1})" 
                    ${page >= pages ? 'disabled' : ''}>
                Далее →
            </button>
        `;

        container.innerHTML = `
            <div class="pagination-info">Показано ${total} заявок</div>
            <div class="pagination-controls">
                ${paginationHTML}
            </div>
        `;
    }

    renderPayouts() {
        const container = document.getElementById('payoutsTable');
        const empty = document.getElementById('payoutsEmpty');

        if (!this.payouts || this.payouts.length === 0) {
            container.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }

        empty.classList.add('hidden');
        container.innerHTML = `
            <table class="payouts-table">
                <thead>
                    <tr>
                        <th>Дата</th>
                        <th>Сумма</th>
                        <th>Причина</th>
                        <th>Администратор</th>
                        <th>Статус</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.payouts.map(payout => `
                        <tr>
                            <td>${gamePlatform.formatDate(payout.createdAt)}</td>
                            <td class="amount-cell">+${payout.amount.toFixed(2)}</td>
                            <td>${payout.reason}</td>
                            <td>${payout.admin.nickname}</td>
                            <td>
                                <span class="status-badge status-approved">
                                    ${payout.status === 'COMPLETED' ? 'Выплачено' : 'В обработке'}
                                </span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    showSubmissionsLoading(show) {
        const loading = document.getElementById('submissionsLoading');
        const grid = document.getElementById('submissionsGrid');
        
        if (show) {
            loading.classList.remove('hidden');
            grid.style.opacity = '0.5';
        } else {
            loading.classList.add('hidden');
            grid.style.opacity = '1';
        }
    }

    showSubmissionModal() {
        gamePlatform.showModal('submissionModal');
    }

    async submitForm() {
        try {
            const form = document.getElementById('submissionForm');
            const submitBtn = document.getElementById('submitBtn');
            
            // Validate form
            if (!this.validateSubmissionForm()) {
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Отправка...';
            gamePlatform.showLoading('Создание заявки...');

            const formData = new FormData(form);
            
            const response = await fetch('/api/submissions', {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Submission failed');
            }

            const result = await response.json();
            
            gamePlatform.showToast('Заявка успешно создана!', 'success');
            gamePlatform.closeModal('submissionModal');
            
            // Reset form
            form.reset();
            this.removeFile();
            
            // Reload submissions
            await this.loadSubmissions();
            await this.loadUserData();
            this.updateUI();

        } catch (error) {
            console.error('Submit form error:', error);
            gamePlatform.showToast(error.message || 'Ошибка создания заявки', 'error');
        } finally {
            const submitBtn = document.getElementById('submitBtn');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Отправить заявку';
            gamePlatform.hideLoading();
        }
    }

    validateSubmissionForm() {
        const category = document.getElementById('category').value;
        const file = document.getElementById('file').files[0];

        if (!category) {
            gamePlatform.showToast('Выберите категорию', 'error');
            return false;
        }

        if (!file) {
            gamePlatform.showToast('Выберите файл', 'error');
            return false;
        }

        // Validate file size
        const maxSize = 100 * 1024 * 1024; // 100MB
        if (file.size > maxSize) {
            gamePlatform.showToast('Файл слишком большой. Максимум: 100 МБ', 'error');
            return false;
        }

        // Validate file type
        const allowedTypes = ['image/', 'video/'];
        if (!allowedTypes.some(type => file.type.startsWith(type))) {
            gamePlatform.showToast('Недопустимый тип файла', 'error');
            return false;
        }

        return true;
    }

    async showSubmissionDetails(submissionId) {
        try {
            gamePlatform.showLoading('Загрузка деталей...');
            
            const submission = await gamePlatform.apiRequest(`/api/submissions/${submissionId}`);
            
            const modal = document.getElementById('submissionDetailsModal');
            const content = document.getElementById('submissionDetailsContent');
            
            const statusClass = `status-${submission.status.toLowerCase()}`;
            const statusText = {
                'PENDING': 'На рассмотрении',
                'APPROVED': 'Одобрено',
                'REJECTED': 'Отклонено'
            }[submission.status];

            const isImage = submission.fileType === 'IMAGE';
            const mediaElement = isImage 
                ? `<img src="${submission.fileUrl}" alt="Submission" style="max-width: 100%; border-radius: 8px;">`
                : `<video src="${submission.fileUrl}" controls style="max-width: 100%; border-radius: 8px;"></video>`;

            content.innerHTML = `
                <div class="submission-details">
                    <div class="submission-media">
                        ${mediaElement}
                    </div>
                    <div class="submission-info-detailed">
                        <div class="detail-row">
                            <strong>Категория:</strong> ${submission.category}
                        </div>
                        <div class="detail-row">
                            <strong>Статус:</strong> 
                            <span class="status-badge ${statusClass}">${statusText}</span>
                        </div>
                        ${submission.description ? `
                            <div class="detail-row">
                                <strong>Описание:</strong> ${submission.description}
                            </div>
                        ` : ''}
                        <div class="detail-row">
                            <strong>Размер файла:</strong> ${gamePlatform.formatFileSize(submission.fileSize)}
                        </div>
                        <div class="detail-row">
                            <strong>Дата создания:</strong> ${gamePlatform.formatDate(submission.createdAt)}
                        </div>
                        ${submission.reviewedAt ? `
                            <div class="detail-row">
                                <strong>Дата рассмотрения:</strong> ${gamePlatform.formatDate(submission.reviewedAt)}
                            </div>
                        ` : ''}
                        ${submission.reviewer ? `
                            <div class="detail-row">
                                <strong>Модератор:</strong> ${submission.reviewer.nickname}
                            </div>
                        ` : ''}
                        ${submission.rejectReason ? `
                            <div class="detail-row">
                                <strong>Причина отклонения:</strong> 
                                <div class="reject-reason">${submission.rejectReason}</div>
                            </div>
                        ` : ''}
                        ${submission.status === 'PENDING' ? `
                            <div class="detail-actions">
                                <button class="btn btn-danger" onclick="dashboard.deleteSubmissionFromModal('${submission.id}')">
                                    Удалить заявку
                                </button>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
            
            gamePlatform.showModal('submissionDetailsModal');
            
        } catch (error) {
            console.error('Show submission details error:', error);
            gamePlatform.showToast('Ошибка загрузки деталей заявки', 'error');
        } finally {
            gamePlatform.hideLoading();
        }
    }

    async deleteSubmission(submissionId) {
        if (!confirm('Вы уверены, что хотите удалить эту заявку?')) {
            return;
        }

        try {
            gamePlatform.showLoading('Удаление заявки...');
            
            await gamePlatform.apiRequest(`/api/submissions/${submissionId}`, {
                method: 'DELETE'
            });
            
            gamePlatform.showToast('Заявка успешно удалена', 'success');
            
            // Reload submissions
            await this.loadSubmissions();
            await this.loadUserData();
            this.updateUI();
            
        } catch (error) {
            console.error('Delete submission error:', error);
            gamePlatform.showToast('Ошибка удаления заявки', 'error');
        } finally {
            gamePlatform.hideLoading();
        }
    }

    async deleteSubmissionFromModal(submissionId) {
        await this.deleteSubmission(submissionId);
        gamePlatform.closeModal('submissionDetailsModal');
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Initialize dashboard
const dashboard = new Dashboard();

// Export for global use
window.dashboard = dashboard;