"""
日志管理服务

提供设备日志的采集、存储、查询和分析功能
"""
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from sqlalchemy import select, func, and_, or_, desc
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from src.models.device_log import DeviceLog, LogLevel, LogFacility, LogSource
from src.models.device import Device
from src.services.logging.ssh_log_collector import SSHLogCollector, LogEntry

logger = structlog.get_logger()


class LogService:
    """日志管理服务"""
    
    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self.ssh_collector = SSHLogCollector()
    
    # ==================== 日志采集 ====================
    
    async def collect_device_logs(
        self, 
        device_id: int, 
        log_type: str = 'system',
        max_entries: int = 100
    ) -> int:
        """采集单个设备的日志
        
        Args:
            device_id: 设备ID
            log_type: 日志类型
            max_entries: 最大条目数
            
        Returns:
            int: 采集到的日志条目数
        """
        try:
            # 获取设备信息
            device_info = await self._get_device_info(device_id)
            if not device_info:
                logger.warning("Device not found", device_id=device_id)
                return 0
            
            # 采集日志
            log_entries = await self.ssh_collector.collect_device_logs(
                device_info, log_type, max_entries
            )
            
            if not log_entries:
                logger.info("No logs collected", device_id=device_id)
                return 0
            
            # 存储日志
            stored_count = await self._store_log_entries(log_entries)
            
            logger.info("Device logs collected and stored", 
                       device_id=device_id, 
                       collected=len(log_entries),
                       stored=stored_count)
            
            return stored_count
            
        except Exception as e:
            logger.error("Failed to collect device logs", 
                        device_id=device_id, error=str(e))
            return 0
    
    async def batch_collect_logs(
        self, 
        device_ids: List[int], 
        log_type: str = 'system',
        max_concurrent: int = 5
    ) -> Dict[int, int]:
        """批量采集设备日志
        
        Args:
            device_ids: 设备ID列表
            log_type: 日志类型
            max_concurrent: 最大并发数
            
        Returns:
            Dict[int, int]: 设备ID到采集条目数的映射
        """
        try:
            # 获取设备信息
            devices_info = await self._get_devices_info(device_ids)
            if not devices_info:
                logger.warning("No valid devices found", device_ids=device_ids)
                return {}
            
            # 批量采集
            results = await self.ssh_collector.batch_collect_logs(
                devices_info, log_type, max_concurrent
            )
            
            # 存储结果
            stored_counts = {}
            for device_id, log_entries in results.items():
                if log_entries:
                    stored_count = await self._store_log_entries(log_entries)
                    stored_counts[device_id] = stored_count
                else:
                    stored_counts[device_id] = 0
            
            logger.info("Batch log collection completed", 
                       devices_count=len(device_ids),
                       total_stored=sum(stored_counts.values()))
            
            return stored_counts
            
        except Exception as e:
            logger.error("Failed to batch collect logs", 
                        device_ids=device_ids, error=str(e))
            return {}
    
    # ==================== 日志查询 ====================
    
    async def get_device_logs(
        self,
        device_id: int,
        skip: int = 0,
        limit: int = 100,
        level: Optional[LogLevel] = None,
        facility: Optional[LogFacility] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        search: Optional[str] = None
    ) -> Tuple[List[Dict[str, Any]], int]:
        """获取设备日志列表
        
        Args:
            device_id: 设备ID
            skip: 跳过条目数
            limit: 限制条目数
            level: 日志级别过滤
            facility: 设施类型过滤
            start_time: 开始时间
            end_time: 结束时间
            search: 搜索关键词
            
        Returns:
            Tuple[List[Dict[str, Any]], int]: 日志列表和总数
        """
        # 构建查询条件
        conditions = [DeviceLog.device_id == device_id]
        
        if level:
            conditions.append(DeviceLog.level == level.value)
        if facility:
            conditions.append(DeviceLog.facility == facility.value)
        if start_time:
            conditions.append(DeviceLog.log_timestamp >= start_time)
        if end_time:
            conditions.append(DeviceLog.log_timestamp <= end_time)
        if search:
            search_pattern = f"%{search}%"
            conditions.append(DeviceLog.message.ilike(search_pattern))
        
        # 查询总数
        count_stmt = select(func.count(DeviceLog.id)).where(and_(*conditions))
        total = await self.db.scalar(count_stmt) or 0
        
        # 查询数据
        stmt = select(DeviceLog).where(and_(*conditions)).order_by(
            desc(DeviceLog.log_timestamp)
        ).offset(skip).limit(limit)
        
        result = await self.db.execute(stmt)
        logs = result.scalars().all()
        
        return [self._log_to_dict(log) for log in logs], total
    
    async def get_recent_logs(
        self,
        device_id: Optional[int] = None,
        hours: int = 24,
        level: Optional[LogLevel] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """获取最近的日志
        
        Args:
            device_id: 设备ID（可选，不指定则获取所有设备）
            hours: 最近小时数
            level: 日志级别过滤
            limit: 限制条目数
            
        Returns:
            List[Dict[str, Any]]: 日志列表
        """
        # 计算时间范围
        start_time = datetime.now() - timedelta(hours=hours)
        
        # 构建查询条件
        conditions = [DeviceLog.log_timestamp >= start_time]
        
        if device_id:
            conditions.append(DeviceLog.device_id == device_id)
        if level:
            conditions.append(DeviceLog.level == level.value)
        
        # 查询数据
        stmt = select(DeviceLog).where(and_(*conditions)).order_by(
            desc(DeviceLog.log_timestamp)
        ).limit(limit)
        
        result = await self.db.execute(stmt)
        logs = result.scalars().all()
        
        return [self._log_to_dict(log) for log in logs]
    
    async def search_logs(
        self,
        keyword: str,
        skip: int = 0,
        limit: int = 100,
        device_id: Optional[int] = None,
        level: Optional[LogLevel] = None
    ) -> Tuple[List[Dict[str, Any]], int]:
        """搜索日志
        
        Args:
            keyword: 搜索关键词
            skip: 跳过条目数
            limit: 限制条目数
            device_id: 设备ID过滤
            level: 日志级别过滤
            
        Returns:
            Tuple[List[Dict[str, Any]], int]: 日志列表和总数
        """
        # 构建搜索条件
        search_pattern = f"%{keyword}%"
        conditions = [DeviceLog.message.ilike(search_pattern)]
        
        if device_id:
            conditions.append(DeviceLog.device_id == device_id)
        if level:
            conditions.append(DeviceLog.level == level.value)
        
        # 查询总数
        count_stmt = select(func.count(DeviceLog.id)).where(and_(*conditions))
        total = await self.db.scalar(count_stmt) or 0
        
        # 查询数据
        stmt = select(DeviceLog).where(and_(*conditions)).order_by(
            desc(DeviceLog.log_timestamp)
        ).offset(skip).limit(limit)
        
        result = await self.db.execute(stmt)
        logs = result.scalars().all()
        
        return [self._log_to_dict(log) for log in logs], total
    
    # ==================== 日志管理 ====================
    
    async def create_log(self, log_data: Dict[str, Any]) -> Dict[str, Any]:
        """创建单条日志记录
        
        Args:
            log_data: 日志数据
            
        Returns:
            Dict[str, Any]: 创建的日志记录
        """
        try:
            db_log = DeviceLog(
                device_id=log_data["device_id"],
                level=log_data["log_level"],
                facility=log_data["facility"],
                source=log_data["source"],
                message=log_data["content"],
                raw_message=log_data.get("content", ""),
                source_ip=log_data.get("source_ip"),
                source_process=log_data.get("source_process"),
                log_timestamp=log_data.get("timestamp", datetime.now()),
                collected_at=datetime.now()
            )
            
            self.db.add(db_log)
            await self.db.flush()
            await self.db.refresh(db_log)
            
            logger.info("Log record created", log_id=db_log.id, device_id=log_data["device_id"])
            return self._log_to_dict(db_log)
            
        except Exception as e:
            logger.error("Failed to create log record", error=str(e))
            raise
    
    async def delete_log(self, log_id: int) -> bool:
        """删除日志记录
        
        Args:
            log_id: 日志ID
            
        Returns:
            bool: 是否删除成功
        """
        try:
            stmt = select(DeviceLog).where(DeviceLog.id == log_id)
            result = await self.db.execute(stmt)
            log = result.scalar_one_or_none()
            
            if log:
                await self.db.delete(log)
                await self.db.flush()
                logger.info("Log record deleted", log_id=log_id)
                return True
            else:
                logger.warning("Log record not found", log_id=log_id)
                return False
                
        except Exception as e:
            logger.error("Failed to delete log record", log_id=log_id, error=str(e))
            return False
    
    async def create_parsing_rule(self, rule_data: Dict[str, Any]) -> Dict[str, Any]:
        """创建日志解析规则
        
        Args:
            rule_data: 规则数据
            
        Returns:
            Dict[str, Any]: 创建的规则
        """
        try:
            # 注意：这里需要先导入LogParsingRule模型
            from src.models.device_log import LogParsingRule
            
            rule = LogParsingRule(
                name=rule_data["name"],
                pattern=rule_data["pattern"],
                vendor=rule_data.get("vendor", "generic"),
                device_type=rule_data.get("device_type"),
                level_mapping=rule_data.get("level_mapping"),
                facility_mapping=rule_data.get("facility_mapping"),
                description=rule_data.get("description"),
                is_active=rule_data.get("is_active", True),
                priority=rule_data.get("priority", 100)
            )
            
            self.db.add(rule)
            await self.db.flush()
            await self.db.refresh(rule)
            
            logger.info("Parsing rule created", rule_id=rule.id, name=rule.name)
            return self._rule_to_dict(rule)
            
        except Exception as e:
            logger.error("Failed to create parsing rule", error=str(e))
            raise
    
    async def delete_parsing_rule(self, rule_id: int) -> bool:
        """删除日志解析规则
        
        Args:
            rule_id: 规则ID
            
        Returns:
            bool: 是否删除成功
        """
        try:
            from src.models.device_log import LogParsingRule
            
            stmt = select(LogParsingRule).where(LogParsingRule.id == rule_id)
            result = await self.db.execute(stmt)
            rule = result.scalar_one_or_none()
            
            if rule:
                await self.db.delete(rule)
                await self.db.flush()
                logger.info("Parsing rule deleted", rule_id=rule_id)
                return True
            else:
                logger.warning("Parsing rule not found", rule_id=rule_id)
                return False
                
        except Exception as e:
            logger.error("Failed to delete parsing rule", rule_id=rule_id, error=str(e))
            return False
    
    def _rule_to_dict(self, rule) -> Dict[str, Any]:
        """将LogParsingRule模型转换为字典"""
        return {
            "id": rule.id,
            "name": rule.name,
            "pattern": rule.pattern,
            "vendor": rule.vendor,
            "device_type": rule.device_type,
            "level_mapping": rule.level_mapping,
            "facility_mapping": rule.facility_mapping,
            "description": rule.description,
            "is_active": rule.is_active,
            "priority": rule.priority,
            "created_at": rule.created_at,
            "updated_at": rule.updated_at
        }

    # ==================== 日志统计 ====================
    
    async def get_log_statistics(
        self,
        device_id: Optional[int] = None,
        hours: int = 24
    ) -> Dict[str, Any]:
        """获取日志统计信息
        
        Args:
            device_id: 设备ID（可选）
            hours: 统计时间范围（小时）
            
        Returns:
            Dict[str, Any]: 统计信息
        """
        start_time = datetime.now() - timedelta(hours=hours)
        
        # 基础查询条件
        base_conditions = [DeviceLog.log_timestamp >= start_time]
        if device_id:
            base_conditions.append(DeviceLog.device_id == device_id)
        
        # 总日志数
        total_stmt = select(func.count(DeviceLog.id)).where(and_(*base_conditions))
        total_logs = await self.db.scalar(total_stmt) or 0
        
        # 按级别统计
        level_stmt = select(
            DeviceLog.level,
            func.count(DeviceLog.id)
        ).where(and_(*base_conditions)).group_by(DeviceLog.level)
        level_result = await self.db.execute(level_stmt)
        by_level = {row[0]: row[1] for row in level_result}
        
        # 按设施统计
        facility_stmt = select(
            DeviceLog.facility,
            func.count(DeviceLog.id)
        ).where(and_(*base_conditions)).group_by(DeviceLog.facility)
        facility_result = await self.db.execute(facility_stmt)
        by_facility = {row[0]: row[1] for row in facility_result}
        
        # 按设备统计（如果不是单设备查询）
        by_device = {}
        if not device_id:
            device_stmt = select(
                DeviceLog.device_id,
                func.count(DeviceLog.id)
            ).where(and_(*base_conditions)).group_by(
                DeviceLog.device_id
            ).order_by(desc(func.count(DeviceLog.id))).limit(10)
            device_result = await self.db.execute(device_stmt)
            by_device = {row[0]: row[1] for row in device_result}
        
        # 时间趋势（按小时）- 修复SQL错误
        try:
            from sqlalchemy import text
            trend_stmt = select(
                text("date_trunc('hour', log_timestamp) as hour"),
                func.count(DeviceLog.id).label('count')
            ).where(and_(*base_conditions)).group_by(
                text("date_trunc('hour', log_timestamp)")
            ).order_by(text('hour'))
            trend_result = await self.db.execute(trend_stmt)
            trends = {str(row[0]): row[1] for row in trend_result}
        except Exception as e:
            logger.warning("Failed to get time trends", error=str(e))
            trends = {}
        
        return {
            "total_logs": total_logs,
            "by_level": by_level,
            "by_facility": by_facility,
            "by_device": by_device,
            "trends": trends,
            "time_range_hours": hours
        }
    
    # ==================== 辅助方法 ====================
    
    async def _get_device_info(self, device_id: int) -> Optional[Dict[str, Any]]:
        """获取设备信息"""
        stmt = select(Device).where(Device.id == device_id)
        result = await self.db.execute(stmt)
        device = result.scalar_one_or_none()
        
        if device:
            return {
                "id": device.id,
                "ip_address": device.ip_address,
                "vendor": device.vendor,
                "device_type": device.device_type,
                "ssh_username": device.ssh_username,
                "ssh_password": device.ssh_password,
                "ssh_port": device.ssh_port
            }
        return None
    
    async def _get_devices_info(self, device_ids: List[int]) -> List[Dict[str, Any]]:
        """获取多个设备信息"""
        stmt = select(Device).where(Device.id.in_(device_ids))
        result = await self.db.execute(stmt)
        devices = result.scalars().all()
        
        return [
            {
                "id": device.id,
                "ip_address": device.ip_address,
                "vendor": device.vendor,
                "device_type": device.device_type,
                "ssh_username": device.ssh_username,
                "ssh_password": device.ssh_password,
                "ssh_port": device.ssh_port
            }
            for device in devices
        ]
    
    async def _store_log_entries(self, log_entries: List[LogEntry]) -> int:
        """存储日志条目到数据库"""
        if not log_entries:
            return 0
        
        try:
            # 批量创建日志记录
            db_logs = []
            for entry in log_entries:
                db_log = DeviceLog(
                    device_id=entry.device_id,
                    level=entry.level.value,
                    facility=entry.facility.value,
                    source=entry.source.value,
                    message=entry.message,
                    raw_message=entry.raw_message,
                    source_ip=entry.source_ip,
                    source_process=entry.source_process,
                    log_timestamp=entry.log_timestamp or entry.collected_at,
                    collected_at=entry.collected_at
                )
                db_logs.append(db_log)
            
            # 批量插入
            self.db.add_all(db_logs)
            await self.db.flush()
            
            return len(db_logs)
            
        except Exception as e:
            logger.error("Failed to store log entries", error=str(e))
            return 0
    
    def _log_to_dict(self, log: DeviceLog) -> Dict[str, Any]:
        """将DeviceLog模型转换为字典"""
        return {
            "id": log.id,
            "device_id": log.device_id,
            "level": log.level,
            "facility": log.facility,
            "source": log.source,
            "message": log.message,
            "raw_message": log.raw_message,
            "source_ip": log.source_ip,
            "source_process": log.source_process,
            "log_timestamp": log.log_timestamp,
            "collected_at": log.collected_at,
            "created_at": log.created_at
        }