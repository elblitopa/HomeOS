import asyncio
import socket


def check_port(port: int, host: str = "127.0.0.1", timeout: float = 0.4) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(timeout)
        return s.connect_ex((host, port)) == 0


async def check_port_async(port: int, host: str = "127.0.0.1", timeout: float = 0.4) -> bool:
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port), timeout=timeout
        )
        writer.close()
        try:
            await writer.wait_closed()
        except (ConnectionError, OSError):
            pass
        return True
    except (asyncio.TimeoutError, ConnectionError, OSError):
        return False


async def check_ports(ports: list[int]) -> dict[int, bool]:
    results = await asyncio.gather(*(check_port_async(p) for p in ports))
    return dict(zip(ports, results))
