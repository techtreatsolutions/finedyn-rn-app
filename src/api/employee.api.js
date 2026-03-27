import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from './client';

export const employeeApi = {
  getEmployees: (params) => apiGet('/employees', params),
  createEmployee: (data) => apiPost('/employees', data),
  updateEmployee: (id, data) => apiPut(`/employees/${id}`, data),
  deleteEmployee: (id) => apiDelete(`/employees/${id}`),
  getSalaryRecords: (params) => apiGet('/employees/salary', params),
  processSalary: (empId, data) => apiPost(`/employees/${empId}/salary`, data),
  updateSalary: (empId, salId, data) => apiPut(`/employees/${empId}/salary/${salId}`, data),
  updateSalaryStatus: (empId, salId, data) => apiPatch(`/employees/${empId}/salary/${salId}/status`, data),
  deleteSalary: (empId, salId) => apiDelete(`/employees/${empId}/salary/${salId}`),
  getAttendance: (params) => apiGet('/employees/attendance', params),
  markAttendance: (empId, data) => apiPost(`/employees/${empId}/attendance`, data),
  updateAttendance: (id, data) => apiPut(`/employees/attendance/${id}`, data),
  getAdvanceSummary: (empId) => apiGet(`/employees/${empId}/advance-summary`),
  getAdvances: (params) => apiGet('/employees/advances', params),
  createAdvance: (data) => apiPost('/employees/advances', data),
  updateAdvance: (id, data) => apiPut(`/employees/advances/${id}`, data),
  deleteAdvance: (id) => apiDelete(`/employees/advances/${id}`),
};
