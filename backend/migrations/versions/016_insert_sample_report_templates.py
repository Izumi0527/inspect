"""Insert sample report templates

Revision ID: 016_insert_sample_report_templates
Revises: 015_add_report_category_and_formats
Create Date: 2025-01-26 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from datetime import datetime
import json

# revision identifiers
revision = '016'
down_revision = '015'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Insert sample report templates for testing"""

    # 定义示例模板数据
    sample_templates = [
        {
            'name': '月度综合报告',
            'description': '包含设备状态、性能指标和趋势分析的综合报告，适用于月度总结',
            'report_type': 'custom',
            'config': json.dumps({
                'title': '月度综合运维报告',
                'period': 'monthly',
                'sections': ['summary', 'devices', 'performance', 'trends', 'recommendations'],
                'dataSource': 'inspection_executions',
                'aggregation': 'monthly'
            }),
            'chart_configs': json.dumps([
                {
                    'id': 'chart_1',
                    'type': 'line',
                    'title': '设备健康度趋势',
                    'dataSource': 'device_health_scores',
                    'xAxis': 'date',
                    'yAxis': 'score',
                    'series': ['avg_score', 'min_score', 'max_score']
                },
                {
                    'id': 'chart_2',
                    'type': 'bar',
                    'title': '巡检成功率对比',
                    'dataSource': 'inspection_success_rate',
                    'xAxis': 'device_type',
                    'yAxis': 'success_rate',
                    'series': ['success_rate']
                },
                {
                    'id': 'chart_3',
                    'type': 'pie',
                    'title': '问题分类统计',
                    'dataSource': 'issue_categories',
                    'series': ['count']
                }
            ]),
            'table_configs': json.dumps([
                {
                    'id': 'table_1',
                    'title': '设备性能指标',
                    'dataSource': 'device_performance',
                    'columns': [
                        {'key': 'device_name', 'title': '设备名称', 'type': 'text', 'sortable': True},
                        {'key': 'uptime', 'title': '在线率', 'type': 'number', 'format': '0.00%', 'sortable': True},
                        {'key': 'avg_response_time', 'title': '平均响应时间', 'type': 'number', 'format': '0.00ms', 'sortable': True},
                        {'key': 'health_score', 'title': '健康分数', 'type': 'number', 'sortable': True}
                    ],
                    'pagination': True,
                    'exportable': True
                }
            ]),
            'theme': 'professional',
            'logo_url': None,
            'header_text': '系统运维月度报告',
            'footer_text': '本报告由智能运维系统自动生成',
            'is_default': True,
            'is_active': True,
            'created_by': None
        },
        {
            'name': '故障分析报告',
            'description': '专注于故障分析和根因排查的专业报告，包含详细的问题统计和解决建议',
            'report_type': 'custom',
            'config': json.dumps({
                'title': '系统故障分析报告',
                'focus': 'issues',
                'sections': ['problem_summary', 'fault_analysis', 'root_cause', 'solutions'],
                'dataSource': 'inspection_issues',
                'severity_threshold': 'high'
            }),
            'chart_configs': json.dumps([
                {
                    'id': 'chart_1',
                    'type': 'bar',
                    'title': '故障类型分布',
                    'dataSource': 'issue_types',
                    'xAxis': 'issue_type',
                    'yAxis': 'count',
                    'series': ['critical', 'high', 'medium', 'low']
                },
                {
                    'id': 'chart_2',
                    'type': 'line',
                    'title': '故障趋势分析',
                    'dataSource': 'issue_trends',
                    'xAxis': 'date',
                    'yAxis': 'count',
                    'series': ['new_issues', 'resolved_issues', 'pending_issues']
                }
            ]),
            'table_configs': json.dumps([
                {
                    'id': 'table_1',
                    'title': '关键故障列表',
                    'dataSource': 'critical_issues',
                    'columns': [
                        {'key': 'device_name', 'title': '设备', 'type': 'text'},
                        {'key': 'issue_type', 'title': '故障类型', 'type': 'text'},
                        {'key': 'severity', 'title': '严重程度', 'type': 'status'},
                        {'key': 'first_detected', 'title': '首次发现', 'type': 'date'},
                        {'key': 'status', 'title': '状态', 'type': 'status'}
                    ],
                    'pagination': True
                }
            ]),
            'theme': 'default',
            'logo_url': None,
            'header_text': '系统故障分析报告',
            'footer_text': '本报告由智能运维系统自动生成',
            'is_default': False,
            'is_active': True,
            'created_by': None
        },
        {
            'name': '性能评估报告',
            'description': '设备性能评估和优化建议报告，包含CPU、内存、网络等关键指标分析',
            'report_type': 'custom',
            'config': json.dumps({
                'title': '设备性能评估报告',
                'focus': 'performance',
                'sections': ['performance_summary', 'cpu_analysis', 'memory_analysis', 'network_analysis', 'recommendations'],
                'dataSource': 'device_metrics',
                'benchmark': True
            }),
            'chart_configs': json.dumps([
                {
                    'id': 'chart_1',
                    'type': 'line',
                    'title': 'CPU使用率趋势',
                    'dataSource': 'cpu_metrics',
                    'xAxis': 'timestamp',
                    'yAxis': 'cpu_usage',
                    'series': ['cpu_usage', 'threshold']
                },
                {
                    'id': 'chart_2',
                    'type': 'line',
                    'title': '内存使用率趋势',
                    'dataSource': 'memory_metrics',
                    'xAxis': 'timestamp',
                    'yAxis': 'memory_usage',
                    'series': ['memory_usage', 'threshold']
                },
                {
                    'id': 'chart_3',
                    'type': 'heatmap',
                    'title': '性能热力图',
                    'dataSource': 'performance_heatmap',
                    'xAxis': 'hour',
                    'yAxis': 'device',
                    'series': ['performance_score']
                }
            ]),
            'table_configs': json.dumps([
                {
                    'id': 'table_1',
                    'title': '性能排名',
                    'dataSource': 'performance_rankings',
                    'columns': [
                        {'key': 'rank', 'title': '排名', 'type': 'number'},
                        {'key': 'device_name', 'title': '设备名称', 'type': 'text'},
                        {'key': 'performance_score', 'title': '性能分数', 'type': 'number', 'sortable': True},
                        {'key': 'cpu_avg', 'title': '平均CPU', 'type': 'number', 'format': '0.00%'},
                        {'key': 'memory_avg', 'title': '平均内存', 'type': 'number', 'format': '0.00%'}
                    ],
                    'pagination': False,
                    'exportable': True
                }
            ]),
            'theme': 'professional',
            'logo_url': None,
            'header_text': '设备性能评估报告',
            'footer_text': '本报告由智能运维系统自动生成',
            'is_default': True,
            'is_active': True,
            'created_by': None
        },
        {
            'name': '可用性报告',
            'description': '设备可用性和SLA达标情况报告，包含停机统计和可靠性分析',
            'report_type': 'custom',
            'config': json.dumps({
                'title': '系统可用性报告',
                'focus': 'availability',
                'sections': ['availability_summary', 'sla_compliance', 'downtime_analysis', 'mttr_mtbf'],
                'dataSource': 'device_availability',
                'sla_threshold': 99.9
            }),
            'chart_configs': json.dumps([
                {
                    'id': 'chart_1',
                    'type': 'bar',
                    'title': '设备可用性统计',
                    'dataSource': 'device_uptime',
                    'xAxis': 'device_name',
                    'yAxis': 'uptime_percentage',
                    'series': ['uptime']
                },
                {
                    'id': 'chart_2',
                    'type': 'line',
                    'title': '可用性趋势',
                    'dataSource': 'availability_trends',
                    'xAxis': 'date',
                    'yAxis': 'availability',
                    'series': ['availability', 'sla_target']
                }
            ]),
            'table_configs': json.dumps([
                {
                    'id': 'table_1',
                    'title': 'SLA达标情况',
                    'dataSource': 'sla_compliance',
                    'columns': [
                        {'key': 'device_name', 'title': '设备', 'type': 'text'},
                        {'key': 'uptime', 'title': '可用率', 'type': 'number', 'format': '0.000%'},
                        {'key': 'sla_target', 'title': 'SLA目标', 'type': 'number', 'format': '0.000%'},
                        {'key': 'compliance', 'title': '达标状态', 'type': 'status'},
                        {'key': 'downtime_minutes', 'title': '停机时长(分钟)', 'type': 'number'}
                    ]
                }
            ]),
            'theme': 'default',
            'logo_url': None,
            'header_text': '系统可用性报告',
            'footer_text': '本报告由智能运维系统自动生成',
            'is_default': False,
            'is_active': True,
            'created_by': None
        },
        {
            'name': '趋势预测报告',
            'description': '基于历史数据的趋势预测和容量规划报告',
            'report_type': 'custom',
            'config': json.dumps({
                'title': '系统趋势预测报告',
                'focus': 'prediction',
                'sections': ['trend_analysis', 'forecasting', 'capacity_planning', 'recommendations'],
                'dataSource': 'historical_metrics',
                'prediction_period': '30_days'
            }),
            'chart_configs': json.dumps([
                {
                    'id': 'chart_1',
                    'type': 'line',
                    'title': '资源使用趋势与预测',
                    'dataSource': 'resource_trends',
                    'xAxis': 'date',
                    'yAxis': 'usage',
                    'series': ['actual', 'predicted', 'upper_bound', 'lower_bound']
                },
                {
                    'id': 'chart_2',
                    'type': 'area',
                    'title': '容量预测',
                    'dataSource': 'capacity_forecast',
                    'xAxis': 'date',
                    'yAxis': 'capacity',
                    'series': ['used', 'available', 'predicted']
                }
            ]),
            'table_configs': json.dumps([
                {
                    'id': 'table_1',
                    'title': '容量告警预测',
                    'dataSource': 'capacity_alerts',
                    'columns': [
                        {'key': 'resource_type', 'title': '资源类型', 'type': 'text'},
                        {'key': 'current_usage', 'title': '当前使用率', 'type': 'number', 'format': '0.00%'},
                        {'key': 'predicted_date', 'title': '预计达到阈值时间', 'type': 'date'},
                        {'key': 'days_remaining', 'title': '剩余天数', 'type': 'number'},
                        {'key': 'recommendation', 'title': '建议', 'type': 'text'}
                    ]
                }
            ]),
            'theme': 'professional',
            'logo_url': None,
            'header_text': '系统趋势预测报告',
            'footer_text': '本报告由智能运维系统自动生成',
            'is_default': False,
            'is_active': True,
            'created_by': None
        }
    ]

    # 插入数据
    connection = op.get_bind()
    for template in sample_templates:
        connection.execute(
            sa.text("""
                INSERT INTO report_templates (
                    name, description, report_type, config, chart_configs, table_configs,
                    theme, logo_url, header_text, footer_text, is_default, is_active, created_by
                ) VALUES (
                    :name, :description, :report_type, :config, :chart_configs, :table_configs,
                    :theme, :logo_url, :header_text, :footer_text, :is_default, :is_active, :created_by
                )
            """),
            template
        )


def downgrade() -> None:
    """Remove sample report templates"""
    connection = op.get_bind()
    connection.execute(
        sa.text("""
            DELETE FROM report_templates
            WHERE name IN (
                '月度综合报告',
                '故障分析报告',
                '性能评估报告',
                '可用性报告',
                '趋势预测报告'
            )
        """)
    )
